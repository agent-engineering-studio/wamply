"""
Chat handler: Claude tool_use orchestration for the Wamply chat agent.

Provides execute_tool() to dispatch 25 tool calls against the database,
and handle_chat() to orchestrate the Claude conversation loop.
"""

import json
from datetime import date

import anthropic

from src.config import settings
from src.memory.supabase_memory import SupabaseMemory
from src.memory.redis_memory import RedisMemory
from src.tools.chat_tools import CHAT_TOOLS
from src.utils.telemetry import log

_client: anthropic.AsyncAnthropic | None = None

SYSTEM_PROMPT = (
    "Sei l'assistente AI di Wamply, una piattaforma di WhatsApp marketing. "
    "Aiuti l'utente a gestire contatti, campagne, template, impostazioni e analisi. "
    "Rispondi sempre in italiano. Sii conciso e pratico. "
    "Quando l'utente chiede di fare qualcosa, usa i tool disponibili. "
    "Quando mostri dati, formattali in modo leggibile."
)

PAGE_SIZE = 20


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _parse_stats(stats) -> dict:
    """Safely parse stats that may be str or dict."""
    if stats is None:
        return {}
    if isinstance(stats, str):
        return json.loads(stats)
    return stats


def _dt_iso(val) -> str | None:
    """Convert a datetime/date to isoformat string, or None."""
    return val.isoformat() if val else None


# ------------------------------------------------------------------ #
# execute_tool: the big dispatcher                                     #
# ------------------------------------------------------------------ #

async def execute_tool(
    tool_name: str,
    tool_input: dict,
    user_id: str,
    db: SupabaseMemory,
    redis: RedisMemory,
) -> dict:
    """Execute a single tool call against the database/redis and return result dict."""

    pool = db.pool

    # ---- Contacts ------------------------------------------------ #

    if tool_name == "list_contacts":
        search = tool_input.get("search")
        tag = tool_input.get("tag")
        page = tool_input.get("page", 1)
        offset = (page - 1) * PAGE_SIZE

        conditions = ["user_id = $1"]
        params: list = [user_id]
        idx = 2

        if search:
            conditions.append(
                f"(name ILIKE ${idx} OR phone ILIKE ${idx} OR email ILIKE ${idx})"
            )
            params.append(f"%{search}%")
            idx += 1

        if tag:
            conditions.append(f"tags @> ARRAY[${idx}]::text[]")
            params.append(tag)
            idx += 1

        where = " AND ".join(conditions)

        count_row = await pool.fetchrow(
            f"SELECT count(*) AS total FROM contacts WHERE {where}", *params
        )
        total = count_row["total"]

        params.extend([PAGE_SIZE, offset])
        rows = await pool.fetch(
            f"SELECT id, phone, name, email, language, tags, opt_in, created_at "
            f"FROM contacts WHERE {where} ORDER BY created_at DESC "
            f"LIMIT ${idx} OFFSET ${idx + 1}",
            *params,
        )

        contacts = [
            {
                "id": str(r["id"]),
                "phone": r["phone"],
                "name": r["name"],
                "email": r["email"],
                "language": r["language"],
                "tags": r["tags"] or [],
                "opt_in": r["opt_in"],
                "created_at": _dt_iso(r["created_at"]),
            }
            for r in rows
        ]
        return {"contacts": contacts, "total": total, "page": page}

    if tool_name == "add_contact":
        row = await pool.fetchrow(
            """
            INSERT INTO contacts (user_id, phone, name, email, language, tags)
            VALUES ($1, $2, $3, $4, $5, $6::text[])
            ON CONFLICT (user_id, phone) DO NOTHING
            RETURNING id
            """,
            user_id,
            tool_input["phone"],
            tool_input.get("name"),
            tool_input.get("email"),
            tool_input.get("language"),
            tool_input.get("tags"),
        )
        if row:
            return {"success": True, "contact_id": str(row["id"])}
        return {"success": False, "error": "Contatto con questo numero già esistente"}

    if tool_name == "update_contact":
        contact_id = tool_input["contact_id"]
        fields = {}
        for key in ("name", "email", "language", "tags"):
            if key in tool_input:
                fields[key] = tool_input[key]

        if not fields:
            return {"success": False, "error": "Nessun campo da aggiornare"}

        set_parts = []
        params = [contact_id, user_id]
        idx = 3
        for col, val in fields.items():
            if col == "tags":
                set_parts.append(f"{col} = ${idx}::text[]")
            else:
                set_parts.append(f"{col} = ${idx}")
            params.append(val)
            idx += 1

        set_clause = ", ".join(set_parts)
        row = await pool.fetchrow(
            f"UPDATE contacts SET {set_clause}, updated_at = now() "
            f"WHERE id = $1 AND user_id = $2 RETURNING id, phone, name, email, language, tags",
            *params,
        )
        if row:
            return {
                "success": True,
                "contact": {
                    "id": str(row["id"]),
                    "phone": row["phone"],
                    "name": row["name"],
                    "email": row["email"],
                    "language": row["language"],
                    "tags": row["tags"] or [],
                },
            }
        return {"success": False, "error": "Contatto non trovato"}

    if tool_name == "delete_contact":
        contact_id = tool_input["contact_id"]
        result = await pool.execute(
            "DELETE FROM contacts WHERE id = $1 AND user_id = $2",
            contact_id,
            user_id,
        )
        if result == "DELETE 1":
            return {"success": True}
        return {"success": False, "error": "Contatto non trovato"}

    if tool_name == "import_contacts":
        contacts_list = tool_input["contacts"]
        imported = 0
        for c in contacts_list:
            row = await pool.fetchrow(
                """
                INSERT INTO contacts (user_id, phone, name, email, language, tags)
                VALUES ($1, $2, $3, $4, $5, $6::text[])
                ON CONFLICT (user_id, phone) DO NOTHING
                RETURNING id
                """,
                user_id,
                c["phone"],
                c.get("name"),
                c.get("email"),
                c.get("language"),
                c.get("tags"),
            )
            if row:
                imported += 1
        return {"imported": imported, "total": len(contacts_list)}

    # ---- Campaigns ----------------------------------------------- #

    if tool_name == "list_campaigns":
        status = tool_input.get("status")
        if status:
            rows = await pool.fetch(
                "SELECT id, name, template_id, status, scheduled_at, started_at, "
                "completed_at, stats, created_at "
                "FROM campaigns WHERE user_id = $1 AND status = $2 "
                "ORDER BY created_at DESC",
                user_id,
                status,
            )
        else:
            rows = await pool.fetch(
                "SELECT id, name, template_id, status, scheduled_at, started_at, "
                "completed_at, stats, created_at "
                "FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC",
                user_id,
            )
        campaigns = [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "template_id": str(r["template_id"]) if r["template_id"] else None,
                "status": r["status"],
                "scheduled_at": _dt_iso(r["scheduled_at"]),
                "started_at": _dt_iso(r["started_at"]),
                "completed_at": _dt_iso(r["completed_at"]),
                "stats": _parse_stats(r["stats"]),
                "created_at": _dt_iso(r["created_at"]),
            }
            for r in rows
        ]
        return {"campaigns": campaigns}

    if tool_name == "get_campaign":
        campaign_id = tool_input["campaign_id"]
        row = await pool.fetchrow(
            "SELECT c.id, c.name, c.template_id, c.group_id, c.segment_query, "
            "c.status, c.scheduled_at, c.started_at, c.completed_at, c.stats, "
            "c.created_at, c.updated_at, "
            "t.name AS template_name, t.language AS template_language "
            "FROM campaigns c "
            "LEFT JOIN templates t ON t.id = c.template_id "
            "WHERE c.id = $1 AND c.user_id = $2",
            campaign_id,
            user_id,
        )
        if not row:
            return {"success": False, "error": "Campagna non trovata"}
        segment = row["segment_query"]
        if isinstance(segment, str):
            segment = json.loads(segment)
        return {
            "id": str(row["id"]),
            "name": row["name"],
            "template_id": str(row["template_id"]) if row["template_id"] else None,
            "template_name": row["template_name"],
            "template_language": row["template_language"],
            "group_id": str(row["group_id"]) if row["group_id"] else None,
            "segment_query": segment,
            "status": row["status"],
            "scheduled_at": _dt_iso(row["scheduled_at"]),
            "started_at": _dt_iso(row["started_at"]),
            "completed_at": _dt_iso(row["completed_at"]),
            "stats": _parse_stats(row["stats"]),
            "created_at": _dt_iso(row["created_at"]),
            "updated_at": _dt_iso(row["updated_at"]),
        }

    if tool_name == "create_campaign":
        scheduled_at = tool_input.get("scheduled_at")
        status = "scheduled" if scheduled_at else "draft"
        row = await pool.fetchrow(
            "INSERT INTO campaigns (user_id, name, template_id, group_id, scheduled_at, status) "
            "VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at",
            user_id,
            tool_input["name"],
            tool_input.get("template_id"),
            tool_input.get("group_id"),
            scheduled_at,
            status,
        )
        return {
            "success": True,
            "campaign": {
                "id": str(row["id"]),
                "name": tool_input["name"],
                "status": status,
                "created_at": _dt_iso(row["created_at"]),
            },
        }

    if tool_name == "update_campaign":
        campaign_id = tool_input["campaign_id"]
        fields = {}
        for key in ("name", "template_id", "group_id", "scheduled_at"):
            if key in tool_input:
                fields[key] = tool_input[key]

        if not fields:
            return {"success": False, "error": "Nessun campo da aggiornare"}

        set_parts = []
        params = [campaign_id, user_id]
        idx = 3
        for col, val in fields.items():
            set_parts.append(f"{col} = ${idx}")
            params.append(val)
            idx += 1

        set_clause = ", ".join(set_parts)
        row = await pool.fetchrow(
            f"UPDATE campaigns SET {set_clause}, updated_at = now() "
            f"WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'scheduled') "
            f"RETURNING id, name, status",
            *params,
        )
        if row:
            return {
                "success": True,
                "campaign": {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "status": row["status"],
                },
            }
        return {"success": False, "error": "Campagna non trovata o non modificabile"}

    if tool_name == "launch_campaign":
        campaign_id = tool_input["campaign_id"]
        row = await pool.fetchrow(
            "SELECT status FROM campaigns WHERE id = $1 AND user_id = $2",
            campaign_id,
            user_id,
        )
        if not row:
            return {"success": False, "error": "Campagna non trovata"}
        if row["status"] not in ("draft", "scheduled"):
            return {"success": False, "error": f"Impossibile avviare: stato attuale è '{row['status']}'"}
        await pool.execute(
            "UPDATE campaigns SET status = 'running', started_at = now(), updated_at = now() "
            "WHERE id = $1",
            campaign_id,
        )
        await redis.enqueue_campaign(campaign_id)
        return {"success": True, "message": "Campagna avviata"}

    if tool_name == "pause_campaign":
        campaign_id = tool_input["campaign_id"]
        await redis.pause(campaign_id)
        await pool.execute(
            "UPDATE campaigns SET status = 'paused', updated_at = now() WHERE id = $1 AND user_id = $2",
            campaign_id,
            user_id,
        )
        return {"success": True, "message": "Campagna messa in pausa"}

    if tool_name == "resume_campaign":
        campaign_id = tool_input["campaign_id"]
        await redis.resume(campaign_id)
        await pool.execute(
            "UPDATE campaigns SET status = 'running', updated_at = now() WHERE id = $1 AND user_id = $2",
            campaign_id,
            user_id,
        )
        await redis.enqueue_campaign(campaign_id)
        return {"success": True, "message": "Campagna ripresa"}

    # ---- Templates ----------------------------------------------- #

    if tool_name == "list_templates":
        rows = await pool.fetch(
            "SELECT id, name, language, category, status, created_at "
            "FROM templates WHERE user_id = $1 ORDER BY created_at DESC",
            user_id,
        )
        templates = [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "language": r["language"],
                "category": r["category"],
                "status": r["status"],
                "created_at": _dt_iso(r["created_at"]),
            }
            for r in rows
        ]
        return {"templates": templates}

    if tool_name == "get_template":
        template_id = tool_input["template_id"]
        row = await pool.fetchrow(
            "SELECT id, name, language, category, components, status, created_at, updated_at "
            "FROM templates WHERE id = $1 AND user_id = $2",
            template_id,
            user_id,
        )
        if not row:
            return {"success": False, "error": "Template non trovato"}
        components = row["components"]
        if isinstance(components, str):
            components = json.loads(components)
        return {
            "id": str(row["id"]),
            "name": row["name"],
            "language": row["language"],
            "category": row["category"],
            "components": components,
            "status": row["status"],
            "created_at": _dt_iso(row["created_at"]),
            "updated_at": _dt_iso(row["updated_at"]),
        }

    if tool_name == "create_template":
        components = tool_input.get("components")
        components_json = json.dumps(components) if components else None
        row = await pool.fetchrow(
            "INSERT INTO templates (user_id, name, language, category, components) "
            "VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id, created_at",
            user_id,
            tool_input["name"],
            tool_input.get("language"),
            tool_input.get("category"),
            components_json,
        )
        return {
            "success": True,
            "template": {
                "id": str(row["id"]),
                "name": tool_input["name"],
                "created_at": _dt_iso(row["created_at"]),
            },
        }

    if tool_name == "update_template":
        template_id = tool_input["template_id"]
        fields = {}
        for key in ("name", "category", "language", "components"):
            if key in tool_input:
                fields[key] = tool_input[key]

        if not fields:
            return {"success": False, "error": "Nessun campo da aggiornare"}

        set_parts = []
        params = [template_id, user_id]
        idx = 3
        for col, val in fields.items():
            if col == "components":
                set_parts.append(f"{col} = ${idx}::jsonb")
                params.append(json.dumps(val))
            else:
                set_parts.append(f"{col} = ${idx}")
                params.append(val)
            idx += 1

        set_clause = ", ".join(set_parts)
        row = await pool.fetchrow(
            f"UPDATE templates SET {set_clause}, updated_at = now() "
            f"WHERE id = $1 AND user_id = $2 RETURNING id, name",
            *params,
        )
        if row:
            return {"success": True, "template": {"id": str(row["id"]), "name": row["name"]}}
        return {"success": False, "error": "Template non trovato"}

    if tool_name == "delete_template":
        template_id = tool_input["template_id"]
        result = await pool.execute(
            "DELETE FROM templates WHERE id = $1 AND user_id = $2",
            template_id,
            user_id,
        )
        if result == "DELETE 1":
            return {"success": True}
        return {"success": False, "error": "Template non trovato"}

    # ---- Dashboard & Analytics ----------------------------------- #

    if tool_name == "get_dashboard_stats":
        contact_count = await pool.fetchval(
            "SELECT count(*) FROM contacts WHERE user_id = $1", user_id
        )

        rows = await pool.fetch(
            "SELECT name, status, stats FROM campaigns "
            "WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5",
            user_id,
        )

        total_sent = 0
        total_delivered = 0
        total_read = 0
        recent = []
        for r in rows:
            s = _parse_stats(r["stats"])
            total_sent += s.get("sent", 0)
            total_delivered += s.get("delivered", 0)
            total_read += s.get("read", 0)
            recent.append({"name": r["name"], "status": r["status"], "stats": s})

        delivery_rate = (total_delivered / total_sent * 100) if total_sent > 0 else 0
        read_rate = (total_read / total_sent * 100) if total_sent > 0 else 0

        return {
            "contacts_total": contact_count,
            "messages_sent": total_sent,
            "delivery_rate": round(delivery_rate, 1),
            "read_rate": round(read_rate, 1),
            "recent_campaigns": recent,
        }

    if tool_name == "get_campaign_stats":
        campaign_id = tool_input["campaign_id"]
        row = await pool.fetchrow(
            "SELECT name, status, stats FROM campaigns WHERE id = $1 AND user_id = $2",
            campaign_id,
            user_id,
        )
        if not row:
            return {"success": False, "error": "Campagna non trovata"}
        return {
            "name": row["name"],
            "status": row["status"],
            "stats": _parse_stats(row["stats"]),
        }

    if tool_name == "get_message_history":
        status_filter = tool_input.get("status")
        campaign_id = tool_input.get("campaign_id")
        limit = tool_input.get("limit", 50)

        conditions = ["ca.user_id = $1"]
        params: list = [user_id]
        idx = 2

        if status_filter:
            conditions.append(f"m.status = ${idx}")
            params.append(status_filter)
            idx += 1

        if campaign_id:
            conditions.append(f"m.campaign_id = ${idx}")
            params.append(campaign_id)
            idx += 1

        where = " AND ".join(conditions)
        params.append(limit)

        rows = await pool.fetch(
            f"SELECT m.id, m.status, m.personalized_text, m.error, "
            f"m.sent_at, m.delivered_at, m.read_at, "
            f"ct.phone AS contact_phone, ct.name AS contact_name, "
            f"ca.name AS campaign_name "
            f"FROM messages m "
            f"JOIN contacts ct ON ct.id = m.contact_id "
            f"JOIN campaigns ca ON ca.id = m.campaign_id "
            f"WHERE {where} "
            f"ORDER BY m.created_at DESC LIMIT ${idx}",
            *params,
        )

        messages = [
            {
                "id": str(r["id"]),
                "status": r["status"],
                "personalized_text": r["personalized_text"],
                "error": r["error"],
                "sent_at": _dt_iso(r["sent_at"]),
                "delivered_at": _dt_iso(r["delivered_at"]),
                "read_at": _dt_iso(r["read_at"]),
                "contact_phone": r["contact_phone"],
                "contact_name": r["contact_name"],
                "campaign_name": r["campaign_name"],
            }
            for r in rows
        ]
        return {"messages": messages}

    # ---- Settings ------------------------------------------------ #

    if tool_name == "get_whatsapp_config":
        row = await pool.fetchrow(
            "SELECT twilio_account_sid, twilio_from, twilio_messaging_service_sid, "
            "business_name, default_language, verified, created_at, updated_at "
            "FROM whatsapp_config WHERE user_id = $1",
            user_id,
        )
        if not row:
            return {"success": False, "error": "Twilio non configurato"}
        return {
            "twilio_account_sid": row["twilio_account_sid"],
            "twilio_from": row["twilio_from"],
            "twilio_messaging_service_sid": row["twilio_messaging_service_sid"],
            "business_name": row["business_name"],
            "default_language": row["default_language"],
            "verified": row["verified"],
            "created_at": _dt_iso(row["created_at"]),
            "updated_at": _dt_iso(row["updated_at"]),
        }

    if tool_name == "update_whatsapp_config":
        from src.utils.encryption import encrypt

        auth_token = tool_input.get("auth_token")
        encrypted_auth_token = encrypt(auth_token) if auth_token else None

        if encrypted_auth_token:
            await pool.execute(
                """
                INSERT INTO whatsapp_config (user_id, twilio_account_sid,
                    twilio_auth_token_encrypted, twilio_from, twilio_messaging_service_sid,
                    business_name, default_language)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (user_id) DO UPDATE SET
                    twilio_account_sid = $2,
                    twilio_auth_token_encrypted = $3,
                    twilio_from = COALESCE($4, whatsapp_config.twilio_from),
                    twilio_messaging_service_sid = COALESCE($5, whatsapp_config.twilio_messaging_service_sid),
                    business_name = COALESCE($6, whatsapp_config.business_name),
                    default_language = COALESCE($7, whatsapp_config.default_language),
                    updated_at = now()
                """,
                user_id,
                tool_input["account_sid"],
                encrypted_auth_token,
                tool_input.get("from_"),
                tool_input.get("messaging_service_sid"),
                tool_input.get("business_name"),
                tool_input.get("default_language"),
            )
        else:
            await pool.execute(
                """
                INSERT INTO whatsapp_config (user_id, twilio_account_sid,
                    twilio_from, twilio_messaging_service_sid,
                    business_name, default_language)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (user_id) DO UPDATE SET
                    twilio_account_sid = $2,
                    twilio_from = COALESCE($3, whatsapp_config.twilio_from),
                    twilio_messaging_service_sid = COALESCE($4, whatsapp_config.twilio_messaging_service_sid),
                    business_name = COALESCE($5, whatsapp_config.business_name),
                    default_language = COALESCE($6, whatsapp_config.default_language),
                    updated_at = now()
                """,
                user_id,
                tool_input["account_sid"],
                tool_input.get("from_"),
                tool_input.get("messaging_service_sid"),
                tool_input.get("business_name"),
                tool_input.get("default_language"),
            )
        return {"success": True, "message": "Configurazione Twilio aggiornata"}

    if tool_name == "get_ai_config":
        row = await pool.fetchrow(
            "SELECT mode, model, temperature, max_tokens, created_at, updated_at "
            "FROM ai_config WHERE user_id = $1",
            user_id,
        )
        if not row:
            return {
                "mode": "system",
                "model": settings.claude_model,
                "temperature": 0.7,
                "max_tokens": 1024,
            }
        return {
            "mode": row["mode"],
            "model": row["model"],
            "temperature": float(row["temperature"]) if row["temperature"] is not None else 0.7,
            "max_tokens": row["max_tokens"] or 1024,
            "created_at": _dt_iso(row["created_at"]),
            "updated_at": _dt_iso(row["updated_at"]),
        }

    if tool_name == "update_ai_config":
        fields = {}
        for key in ("model", "temperature", "max_tokens"):
            if key in tool_input:
                fields[key] = tool_input[key]

        if not fields:
            return {"success": False, "error": "Nessun campo da aggiornare"}

        # Build UPSERT with only provided fields
        cols = ["user_id"]
        vals = ["$1"]
        update_parts = []
        params: list = [user_id]
        idx = 2
        for col, val in fields.items():
            cols.append(col)
            vals.append(f"${idx}")
            update_parts.append(f"{col} = ${idx}")
            params.append(val)
            idx += 1

        await pool.execute(
            f"INSERT INTO ai_config ({', '.join(cols)}) VALUES ({', '.join(vals)}) "
            f"ON CONFLICT (user_id) DO UPDATE SET {', '.join(update_parts)}, updated_at = now()",
            *params,
        )
        return {"success": True, "message": "Configurazione AI aggiornata"}

    if tool_name == "get_plan_usage":
        row = await pool.fetchrow(
            """
            SELECT p.name AS plan_name, p.slug, p.price_cents,
                   p.max_campaigns_month, p.max_contacts, p.max_messages_month,
                   p.max_templates, p.llm_model, p.features,
                   s.status AS subscription_status,
                   u.campaigns_used, u.messages_used, u.contacts_count, u.period_start
            FROM subscriptions s
            JOIN plans p ON p.id = s.plan_id
            LEFT JOIN usage_counters u ON u.user_id = s.user_id
            WHERE s.user_id = $1 AND s.status = 'active'
            ORDER BY u.period_start DESC NULLS LAST
            LIMIT 1
            """,
            user_id,
        )
        if not row:
            return {"success": False, "error": "Nessun piano attivo"}

        features = row["features"]
        if isinstance(features, str):
            features = json.loads(features)

        return {
            "plan": row["plan_name"],
            "slug": row["slug"],
            "price_cents": row["price_cents"],
            "limits": {
                "max_campaigns_month": row["max_campaigns_month"],
                "max_contacts": row["max_contacts"],
                "max_messages_month": row["max_messages_month"],
                "max_templates": row["max_templates"],
            },
            "llm_model": row["llm_model"],
            "features": features,
            "usage": {
                "campaigns_used": row["campaigns_used"] or 0,
                "messages_used": row["messages_used"] or 0,
                "contacts_count": row["contacts_count"] or 0,
                "period_start": _dt_iso(row["period_start"]),
            },
        }

    # Unknown tool
    return {"success": False, "error": f"Tool sconosciuto: {tool_name}"}


# ------------------------------------------------------------------ #
# handle_chat: the main orchestrator                                   #
# ------------------------------------------------------------------ #

async def handle_chat(
    prompt: str,
    user_id: str,
    db: SupabaseMemory,
    redis: RedisMemory,
) -> dict:
    """
    Main chat orchestrator.

    1. If mock_llm, return mock response.
    2. Call Claude with system prompt + tools + user message.
    3. If end_turn, return text.
    4. If tool_use, execute tools and send results back to Claude.
    5. Fallback.
    """

    if settings.mock_llm:
        return {"response": f"[mock] Hai detto: {prompt}"}

    client = _get_client()

    messages = [{"role": "user", "content": prompt}]

    try:
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=CHAT_TOOLS,
            messages=messages,
        )
    except Exception as exc:
        await log.aerror("chat_claude_error", error=str(exc))
        return {"response": "Errore nella comunicazione con l'AI. Riprova tra poco."}

    # end_turn: direct text response
    if response.stop_reason == "end_turn":
        text = ""
        for block in response.content:
            if block.type == "text":
                text += block.text
        return {"response": text or "Non ho capito, puoi riformulare?"}

    # tool_use: execute tools and get summary
    if response.stop_reason == "tool_use":
        tool_calls = []
        tool_results = []

        for block in response.content:
            if block.type == "tool_use":
                tool_name = block.name
                tool_input = block.input
                tool_calls.append({"tool": tool_name, "input": tool_input})

                try:
                    result = await execute_tool(tool_name, tool_input, user_id, db, redis)
                except Exception as exc:
                    await log.aerror("tool_exec_error", tool=tool_name, error=str(exc))
                    result = {"success": False, "error": str(exc)}

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })

        # Send tool results back to Claude for natural language summary
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

        try:
            summary = await client.messages.create(
                model=settings.claude_model,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=CHAT_TOOLS,
                messages=messages,
            )
        except Exception as exc:
            await log.aerror("chat_summary_error", error=str(exc))
            return {
                "response": "Ho eseguito le operazioni ma non riesco a generare il riepilogo.",
                "tool_calls": tool_calls,
            }

        text = ""
        for block in summary.content:
            if block.type == "text":
                text += block.text

        return {
            "response": text or "Operazione completata.",
            "tool_calls": tool_calls,
        }

    # Fallback
    text = ""
    for block in response.content:
        if block.type == "text":
            text += block.text
    return {"response": text or "Non ho capito, puoi riformulare?"}
