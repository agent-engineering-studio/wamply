"""Contact groups CRUD + AI-powered "smart group" suggestion.

The smart-group flow:
  1. User describes the group in free text.
  2. POST /groups/suggest → Claude returns a deterministic filter
     (tags ANY/ALL + languages) + preview of estimated audience.
  3. User reviews, optionally edits name/description, confirms.
  4. POST /groups with the filter creates the group AND populates
     `contact_group_members` by running the filter server-side.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.ai_assists import suggest_group
from src.services.ai_credits import (
    commit_credits,
    reserve_credits,
    resolve_api_key,
)

router = APIRouter(prefix="/groups")


def _serialize(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


@router.get("")
async def list_groups(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """List all groups owned by the current user, with member counts."""
    db = get_db(request)
    rows = await db.fetch(
        """SELECT g.id, g.name, g.description, g.created_at, g.updated_at,
                  COALESCE(m.n, 0)::int AS member_count
           FROM contact_groups g
           LEFT JOIN (
               SELECT group_id, count(*) AS n
               FROM contact_group_members GROUP BY group_id
           ) m ON m.group_id = g.id
           WHERE g.user_id = $1
           ORDER BY g.created_at DESC""",
        user.id,
    )
    return {"groups": [_serialize(r) for r in rows]}


@router.post("", status_code=201)
async def create_group(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Create a group. If `filter` is provided, populate members immediately.

    Body:
      {
        "name": "VIP Milano",
        "description": "...",
        "filter": {                        # optional
          "tags_any": ["vip"],
          "tags_all": [],
          "languages": ["it"]
        }
      }
    """
    db = get_db(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Il nome del gruppo è obbligatorio.")

    description = (body.get("description") or "").strip() or None
    filt = body.get("filter") or {}

    async with db.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """INSERT INTO contact_groups (user_id, name, description)
               VALUES ($1, $2, $3) RETURNING *""",
            user.id, name, description,
        )
        group_id = row["id"]

        if filt:
            tags_any = [t for t in (filt.get("tags_any") or []) if isinstance(t, str)]
            tags_all = [t for t in (filt.get("tags_all") or []) if isinstance(t, str)]
            languages = [l for l in (filt.get("languages") or []) if isinstance(l, str)]

            clauses = ["user_id = $1", "opt_in = true"]
            params: list = [user.id]
            idx = 2
            if tags_any:
                clauses.append(f"tags && ${idx}::text[]")
                params.append(tags_any)
                idx += 1
            if tags_all:
                clauses.append(f"tags @> ${idx}::text[]")
                params.append(tags_all)
                idx += 1
            if languages:
                clauses.append(f"language = ANY(${idx}::text[])")
                params.append(languages)
                idx += 1
            where = " AND ".join(clauses)

            await conn.execute(
                f"""INSERT INTO contact_group_members (contact_id, group_id)
                    SELECT id, ${idx} FROM contacts WHERE {where}
                    ON CONFLICT DO NOTHING""",
                *params, group_id,
            )

        count_row = await conn.fetchrow(
            "SELECT count(*)::int AS n FROM contact_group_members WHERE group_id = $1",
            group_id,
        )

    out = _serialize(row)
    out["member_count"] = count_row["n"] if count_row else 0
    return out


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    request: Request,
    group_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    result = await db.execute(
        "DELETE FROM contact_groups WHERE id = $1 AND user_id = $2",
        group_id, user.id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Gruppo non trovato.")
    return None


# ── AI: smart group suggestion ────────────────────────────────

@router.post("/suggest")
async def suggest_smart_group(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Propose a deterministic filter for a described group (2 credits, Sonnet)."""
    body = await request.json()
    description = (body.get("description") or "").strip()
    if not description or len(description) < 5:
        raise HTTPException(
            status_code=400,
            detail="Descrivi il gruppo in almeno 5 caratteri (es. 'clienti VIP di Milano').",
        )
    if len(description) > 500:
        raise HTTPException(status_code=400, detail="Descrizione troppo lunga (max 500 caratteri).")

    db = get_db(request)
    redis = get_redis(request)

    total = await db.fetchval(
        "SELECT count(*) FROM contacts WHERE user_id = $1 AND opt_in = true",
        user.id,
    )
    tags = await db.fetch(
        "SELECT unnest(tags) AS tag, count(*)::int AS c FROM contacts "
        "WHERE user_id = $1 AND opt_in = true GROUP BY tag ORDER BY c DESC LIMIT 30",
        user.id,
    )
    langs = await db.fetch(
        "SELECT language, count(*)::int AS c FROM contacts "
        "WHERE user_id = $1 AND opt_in = true GROUP BY language ORDER BY c DESC",
        user.id,
    )
    context = {
        "total_contacts": int(total or 0),
        "tags_vocabulary": [
            {"tag": r["tag"], "count": r["c"]} for r in tags if r["tag"]
        ],
        "languages": [{"language": r["language"], "count": r["c"]} for r in langs],
    }

    reservation = await reserve_credits(db, redis, str(user.id), "group_suggest")
    api_key, _ = await resolve_api_key(db, str(user.id))

    try:
        suggestion, tin, tout = await suggest_group(description, context, api_key)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"GroupSuggest error: {e}") from e

    await commit_credits(db, redis, reservation, tin, tout)

    # Compute a real audience preview using the exact SQL that /groups POST
    # will run on apply — so the user sees what they'll get, not a vibe estimate.
    real_count = await _preview_audience(
        db,
        user_id=str(user.id),
        tags_any=suggestion.filter_tags_any,
        tags_all=suggestion.filter_tags_all,
        languages=suggestion.filter_languages,
    )
    out = suggestion.model_dump()
    out["real_audience"] = real_count
    return out


async def _preview_audience(
    db,
    user_id: str,
    tags_any: list[str],
    tags_all: list[str],
    languages: list[str],
) -> int:
    clauses = ["user_id = $1", "opt_in = true"]
    params: list = [user_id]
    idx = 2
    if tags_any:
        clauses.append(f"tags && ${idx}::text[]")
        params.append(tags_any)
        idx += 1
    if tags_all:
        clauses.append(f"tags @> ${idx}::text[]")
        params.append(tags_all)
        idx += 1
    if languages:
        clauses.append(f"language = ANY(${idx}::text[])")
        params.append(languages)
        idx += 1
    sql = "SELECT count(*)::int AS n FROM contacts WHERE " + " AND ".join(clauses)
    row = await db.fetchrow(sql, *params)
    return int(row["n"]) if row else 0
