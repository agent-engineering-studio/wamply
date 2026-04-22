"""Message history endpoints: paginated feed + AI failure analysis.

Reads from the `messages` table joining campaign + contact to produce a
flat timeline used by the `/history` page.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
import json

import anthropic
from pydantic import BaseModel, Field, ValidationError

from src.auth.jwt import CurrentUser, get_current_user
from src.config import settings
from src.dependencies import get_db, get_redis
from src.services import ai_models
from src.services.ai_credits import (
    commit_credits,
    reserve_credits,
    resolve_api_key,
)

router = APIRouter(prefix="/messages")


STATUS_WHITELIST = {"pending", "sent", "delivered", "read", "failed"}


@router.get("")
async def list_messages(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    status: str | None = None,
    page: int = Query(1, ge=1),
):
    """Paginated message feed across all the user's campaigns."""
    db = get_db(request)
    limit = 50
    offset = (page - 1) * limit

    clauses = ["c.user_id = $1"]
    params: list = [user.id]
    idx = 2
    if status:
        if status not in STATUS_WHITELIST:
            raise HTTPException(status_code=400, detail=f"Stato non valido: {status}")
        clauses.append(f"m.status::text = ${idx}")
        params.append(status)
        idx += 1

    where = " AND ".join(clauses)

    total_row = await db.fetchrow(
        f"SELECT count(*) FROM messages m "
        f"JOIN campaigns c ON c.id = m.campaign_id "
        f"WHERE {where}",
        *params,
    )
    total = total_row["count"] if total_row else 0

    rows = await db.fetch(
        f"""SELECT m.id, m.status::text AS status, m.error,
                   m.sent_at, m.delivered_at, m.read_at, m.created_at,
                   c.id AS campaign_id, c.name AS campaign_name,
                   ct.id AS contact_id, ct.name AS contact_name, ct.phone AS contact_phone
            FROM messages m
            JOIN campaigns c ON c.id = m.campaign_id
            JOIN contacts ct ON ct.id = m.contact_id
            WHERE {where}
            ORDER BY m.created_at DESC
            LIMIT ${idx} OFFSET ${idx + 1}""",
        *params, limit, offset,
    )

    items = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, "hex"):
                d[k] = str(v)
            elif hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        items.append(d)

    return {"messages": items, "total": total, "page": page, "limit": limit}


# ── AI: failure pattern analysis ─────────────────────────────

class FailureInsight(BaseModel):
    headline: str = Field(..., min_length=1, max_length=200)
    root_causes: list[str] = Field(default_factory=list, max_length=4)
    next_action: str = Field(..., min_length=1, max_length=200)


FAILURE_SYSTEM_PROMPT = """Sei un analista di deliverability WhatsApp. Ricevi
un campione di messaggi falliti (max 30, solo metadati aggregati: codice
errore Twilio, categoria template, stato campagna, timestamp). PRODUCI un
JSON con:
- headline: 1 frase che riassume il pattern principale (max 200 caratteri)
- root_causes: max 4 cause probabili in ordine di plausibilità (es. "Numeri
  non validi nell'import CSV", "Opt-in scaduto", "Template rifiutato da Meta")
- next_action: cosa fare oggi (max 200 caratteri)

Parla in italiano, tono concreto, no marketing-speak. Se i dati sono troppo
pochi per un'analisi onesta, dillo in headline.

Rispondi SOLO con JSON valido."""


def _extract_json(text: str) -> str:
    import re
    m = re.search(r"\{[\s\S]*\}", text)
    return m.group(0) if m else text


@router.post("/failure-insight")
async def failure_insight(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Sonnet analysis of the user's most recent failed messages (2 credits)."""
    db = get_db(request)
    redis = get_redis(request)

    rows = await db.fetch(
        """SELECT m.status::text AS status, m.error, m.created_at,
                  c.name AS campaign_name, c.status::text AS campaign_status,
                  t.category AS template_category
           FROM messages m
           JOIN campaigns c ON c.id = m.campaign_id
           LEFT JOIN templates t ON t.id = c.template_id
           WHERE c.user_id = $1 AND m.status = 'failed'
           ORDER BY m.created_at DESC
           LIMIT 30""",
        user.id,
    )
    if not rows:
        raise HTTPException(
            status_code=400,
            detail="Nessun messaggio fallito da analizzare. Torna quando hai almeno 1 fallimento.",
        )

    sample = []
    for r in rows:
        sample.append({
            "error": r["error"] or "unknown",
            "template_category": r["template_category"],
            "campaign_status": r["campaign_status"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        })

    # Aggregate error codes for the prompt so Claude can spot the dominant cause
    from collections import Counter
    error_counter = Counter((s["error"] or "unknown")[:100] for s in sample)
    context = {
        "failed_count": len(sample),
        "top_error_codes": error_counter.most_common(5),
        "sample_last_30": sample[:30],
    }

    reservation = await reserve_credits(db, redis, str(user.id), "dashboard_insight")
    api_key, _ = await resolve_api_key(db, str(user.id))

    if settings.mock_llm or not api_key:
        result = FailureInsight(
            headline=f"[mock] {len(sample)} messaggi falliti analizzati.",
            root_causes=["Configura una chiave Claude per ricevere diagnosi reali."],
            next_action="Vai in Admin → Claude API per configurare la chiave system.",
        )
        await commit_credits(db, redis, reservation, 0, 0)
        return result.model_dump()

    client = anthropic.Anthropic(api_key=api_key)
    user_msg = f"Campione di fallimenti:\n{json.dumps(context, ensure_ascii=False, default=str)}"
    response = client.messages.create(
        model=ai_models.model_id("dashboard_insight"),
        max_tokens=700,
        temperature=0.3,
        system=FAILURE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    usage = getattr(response, "usage", None)
    tin = getattr(usage, "input_tokens", 0) or 0
    tout = getattr(usage, "output_tokens", 0) or 0

    try:
        parsed = json.loads(_extract_json(raw))
        result = FailureInsight(**parsed)
    except (ValueError, ValidationError) as e:
        raise HTTPException(status_code=502, detail=f"FailureInsight AI malformato: {e}") from e

    await commit_credits(db, redis, reservation, tin, tout)
    return result.model_dump()
