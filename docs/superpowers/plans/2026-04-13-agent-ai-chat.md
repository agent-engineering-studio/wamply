# Agent AI Chat & Prompt Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the AI agent to perform all frontend operations via natural language prompts, with a chat UI and hardcoded quick-prompts covering every operation.

**Architecture:** Add a `/chat` POST endpoint to the FastAPI agent that uses Claude's `tool_use` to route user prompts to database operations. The frontend `/agent` page becomes a real chat interface with categorized quick-prompt buttons. The agent's chat handler defines tools mirroring all frontend CRUD operations (contacts, campaigns, templates, settings, history, dashboard stats). Claude decides which tool to call based on the user's natural language input.

**Tech Stack:** Python/FastAPI + Anthropic SDK (tool_use) on agent side; React/Next.js on frontend side. All data flows through the existing Supabase PostgreSQL database via the agent's `SupabaseMemory` pool.

---

## File Structure

### Agent (Python)

| File | Action | Responsibility |
|------|--------|----------------|
| `agent/src/tools/chat_tools.py` | Create | Define all Claude tool schemas as Python dicts |
| `agent/src/agents/chat_handler.py` | Create | Claude tool_use orchestration: receive prompt, call tools, return response |
| `agent/src/api/endpoints/chat.py` | Create | `POST /chat` endpoint — receives prompt + user_id, returns AI response |
| `agent/src/api/router.py` | Modify | Register chat router |
| `agent/src/main.py` | Modify | Wire DB/Redis to chat endpoint via `set_resources` |

### Frontend (TypeScript/React)

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/app/api/agent/chat/route.ts` | Create | Next.js API proxy: forwards to agent `/chat` with auth |
| `frontend/src/app/(dashboard)/agent/page.tsx` | Rewrite | Full chat UI + quick prompts grid |

---

## Task 1: Agent — Chat Tool Definitions

**Files:**
- Create: `agent/src/tools/chat_tools.py`

- [ ] **Step 1: Create the tool definitions file**

This file exports a list of Anthropic tool schemas. Each tool maps to a frontend operation.

```python
"""Claude tool_use definitions for the chat handler."""

CHAT_TOOLS: list[dict] = [
    # ── Contacts ──
    {
        "name": "list_contacts",
        "description": "Cerca e lista i contatti dell'utente. Supporta ricerca per nome/telefono/email e filtro per tag.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Testo da cercare in nome, telefono o email"},
                "tag": {"type": "string", "description": "Filtra per tag specifico"},
                "page": {"type": "integer", "description": "Numero di pagina (default 1)", "default": 1},
            },
            "required": [],
        },
    },
    {
        "name": "add_contact",
        "description": "Aggiunge un nuovo contatto.",
        "input_schema": {
            "type": "object",
            "properties": {
                "phone": {"type": "string", "description": "Numero di telefono con prefisso internazionale (es. +39...)"},
                "name": {"type": "string", "description": "Nome del contatto"},
                "email": {"type": "string", "description": "Email del contatto"},
                "language": {"type": "string", "description": "Lingua (default: it)", "default": "it"},
                "tags": {"type": "array", "items": {"type": "string"}, "description": "Lista di tag"},
            },
            "required": ["phone"],
        },
    },
    {
        "name": "update_contact",
        "description": "Aggiorna un contatto esistente per ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "ID del contatto da aggiornare"},
                "name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "language": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "delete_contact",
        "description": "Elimina un contatto per ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "ID del contatto da eliminare"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "import_contacts",
        "description": "Importa una lista di contatti in blocco.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contacts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "phone": {"type": "string"},
                            "name": {"type": "string"},
                            "email": {"type": "string"},
                            "language": {"type": "string"},
                            "tags": {"type": "string", "description": "Tag separati da virgola"},
                        },
                        "required": ["phone"],
                    },
                    "description": "Lista di contatti da importare",
                },
            },
            "required": ["contacts"],
        },
    },
    # ── Campaigns ──
    {
        "name": "list_campaigns",
        "description": "Lista le campagne dell'utente, opzionalmente filtrate per stato.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["draft", "scheduled", "running", "paused", "completed", "failed"],
                    "description": "Filtra per stato",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_campaign",
        "description": "Ottieni i dettagli di una campagna specifica, incluse statistiche.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string", "description": "ID della campagna"},
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "create_campaign",
        "description": "Crea una nuova campagna WhatsApp.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Nome della campagna"},
                "template_id": {"type": "string", "description": "ID del template da usare"},
                "group_id": {"type": "string", "description": "ID del gruppo di contatti (opzionale)"},
                "scheduled_at": {"type": "string", "description": "Data/ora di invio programmato ISO 8601 (opzionale)"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_campaign",
        "description": "Aggiorna una campagna esistente (solo bozze/programmate).",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string", "description": "ID della campagna"},
                "name": {"type": "string"},
                "template_id": {"type": "string"},
                "group_id": {"type": "string"},
                "scheduled_at": {"type": "string"},
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "launch_campaign",
        "description": "Avvia una campagna in stato draft o scheduled.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string", "description": "ID della campagna da avviare"},
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "pause_campaign",
        "description": "Metti in pausa una campagna in corso.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string", "description": "ID della campagna"},
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "resume_campaign",
        "description": "Riprendi una campagna in pausa.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string", "description": "ID della campagna"},
            },
            "required": ["campaign_id"],
        },
    },
    # ── Templates ──
    {
        "name": "list_templates",
        "description": "Lista tutti i template WhatsApp dell'utente.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_template",
        "description": "Ottieni i dettagli di un template specifico.",
        "input_schema": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string", "description": "ID del template"},
            },
            "required": ["template_id"],
        },
    },
    {
        "name": "create_template",
        "description": "Crea un nuovo template WhatsApp.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Nome del template"},
                "category": {
                    "type": "string",
                    "enum": ["marketing", "utility", "authentication"],
                    "description": "Categoria (default: marketing)",
                },
                "language": {"type": "string", "description": "Codice lingua (default: it)"},
                "components": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Componenti del template (header, body, footer, buttons)",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_template",
        "description": "Aggiorna un template esistente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string", "description": "ID del template"},
                "name": {"type": "string"},
                "category": {"type": "string"},
                "language": {"type": "string"},
                "components": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["template_id"],
        },
    },
    {
        "name": "delete_template",
        "description": "Elimina un template per ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string", "description": "ID del template da eliminare"},
            },
            "required": ["template_id"],
        },
    },
    # ── Dashboard & Analytics ──
    {
        "name": "get_dashboard_stats",
        "description": "Ottieni statistiche dashboard: contatti totali, messaggi inviati, tasso consegna, tasso lettura, campagne recenti.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_campaign_stats",
        "description": "Ottieni le statistiche dettagliate di una campagna: totale, inviati, consegnati, letti, falliti.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string", "description": "ID della campagna"},
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "get_message_history",
        "description": "Ottieni lo storico messaggi con filtro per stato.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["sent", "delivered", "read", "failed"],
                    "description": "Filtra per stato messaggio",
                },
                "campaign_id": {"type": "string", "description": "Filtra per campagna"},
                "limit": {"type": "integer", "description": "Numero massimo di risultati (default 50)", "default": 50},
            },
            "required": [],
        },
    },
    # ── Settings ──
    {
        "name": "get_whatsapp_config",
        "description": "Visualizza la configurazione WhatsApp Business corrente.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "update_whatsapp_config",
        "description": "Aggiorna la configurazione WhatsApp Business.",
        "input_schema": {
            "type": "object",
            "properties": {
                "phone_number_id": {"type": "string", "description": "Phone Number ID da Meta"},
                "waba_id": {"type": "string", "description": "WhatsApp Business Account ID"},
                "token": {"type": "string", "description": "Access Token WhatsApp"},
                "business_name": {"type": "string", "description": "Nome business"},
                "default_language": {"type": "string", "description": "Lingua predefinita"},
            },
            "required": ["phone_number_id", "waba_id"],
        },
    },
    {
        "name": "get_ai_config",
        "description": "Visualizza la configurazione AI corrente (modello, temperatura, max_tokens).",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "update_ai_config",
        "description": "Aggiorna la configurazione AI (modello, temperatura, max_tokens).",
        "input_schema": {
            "type": "object",
            "properties": {
                "model": {
                    "type": "string",
                    "enum": ["claude-haiku-4-5-20251001", "claude-sonnet-4-20250514"],
                    "description": "Modello Claude",
                },
                "temperature": {"type": "number", "description": "Temperatura (0-1)"},
                "max_tokens": {"type": "integer", "description": "Max tokens (50-4096)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_plan_usage",
        "description": "Mostra il piano corrente, limiti e utilizzo (campagne, contatti, messaggi usati).",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]
```

- [ ] **Step 2: Verify file created**

Run: `python -c "from src.tools.chat_tools import CHAT_TOOLS; print(f'{len(CHAT_TOOLS)} tools defined')"`
Expected: `25 tools defined`

- [ ] **Step 3: Commit**

```bash
git add agent/src/tools/chat_tools.py
git commit -m "feat(agent): add Claude tool_use definitions for all chat operations"
```

---

## Task 2: Agent — Chat Handler (Claude tool_use orchestration)

**Files:**
- Create: `agent/src/agents/chat_handler.py`

- [ ] **Step 1: Create the chat handler**

This module receives a prompt + user_id, calls Claude with tools, executes the selected tool against the DB, and returns a natural language response.

```python
"""Chat handler — routes natural language prompts to DB operations via Claude tool_use."""

import json
from datetime import date

import anthropic

from src.config import settings
from src.memory.supabase_memory import SupabaseMemory
from src.memory.redis_memory import RedisMemory
from src.tools.chat_tools import CHAT_TOOLS
from src.utils.telemetry import log

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


SYSTEM_PROMPT = """Sei l'assistente AI di Wamply, una piattaforma di WhatsApp marketing.
Aiuti l'utente a gestire contatti, campagne, template, impostazioni e analisi.
Rispondi sempre in italiano. Sii conciso e pratico.
Quando l'utente chiede di fare qualcosa, usa i tool disponibili.
Quando mostri dati, formattali in modo leggibile."""


async def execute_tool(
    tool_name: str,
    tool_input: dict,
    user_id: str,
    db: SupabaseMemory,
    redis: RedisMemory,
) -> dict:
    """Execute a tool call against the database. Returns the result as a dict."""
    pool = db.pool

    # ── Contacts ──
    if tool_name == "list_contacts":
        search = tool_input.get("search", "")
        tag = tool_input.get("tag")
        page = tool_input.get("page", 1)
        limit = 50
        offset = (page - 1) * limit

        if search and tag:
            rows = await pool.fetch(
                """SELECT id, phone, name, email, tags, language, opt_in, created_at
                   FROM contacts WHERE user_id = $1 AND opt_in = true
                   AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
                   AND tags @> $3::text[]
                   ORDER BY created_at DESC LIMIT $4 OFFSET $5""",
                user_id, f"%{search}%", [tag], limit, offset,
            )
        elif search:
            rows = await pool.fetch(
                """SELECT id, phone, name, email, tags, language, opt_in, created_at
                   FROM contacts WHERE user_id = $1 AND opt_in = true
                   AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
                   ORDER BY created_at DESC LIMIT $3 OFFSET $4""",
                user_id, f"%{search}%", limit, offset,
            )
        elif tag:
            rows = await pool.fetch(
                """SELECT id, phone, name, email, tags, language, opt_in, created_at
                   FROM contacts WHERE user_id = $1 AND opt_in = true AND tags @> $2::text[]
                   ORDER BY created_at DESC LIMIT $3 OFFSET $4""",
                user_id, [tag], limit, offset,
            )
        else:
            rows = await pool.fetch(
                """SELECT id, phone, name, email, tags, language, opt_in, created_at
                   FROM contacts WHERE user_id = $1 AND opt_in = true
                   ORDER BY created_at DESC LIMIT $2 OFFSET $3""",
                user_id, limit, offset,
            )

        count_row = await pool.fetchrow(
            "SELECT count(*) FROM contacts WHERE user_id = $1 AND opt_in = true", user_id,
        )
        total = count_row["count"] if count_row else 0

        contacts = [
            {
                "id": str(r["id"]), "phone": r["phone"], "name": r["name"],
                "email": r["email"], "tags": r["tags"] or [], "language": r["language"],
            }
            for r in rows
        ]
        return {"contacts": contacts, "total": total, "page": page}

    if tool_name == "add_contact":
        phone = tool_input["phone"]
        row = await pool.fetchrow(
            """INSERT INTO contacts (user_id, phone, name, email, language, tags, opt_in, opt_in_date)
               VALUES ($1, $2, $3, $4, $5, $6::text[], true, now())
               ON CONFLICT (user_id, phone) DO NOTHING
               RETURNING id, phone, name""",
            user_id, phone, tool_input.get("name"),
            tool_input.get("email"), tool_input.get("language", "it"),
            tool_input.get("tags", []),
        )
        if not row:
            return {"error": "Contatto con questo numero già esistente."}
        return {"success": True, "contact": {"id": str(row["id"]), "phone": row["phone"], "name": row["name"]}}

    if tool_name == "update_contact":
        cid = tool_input.pop("contact_id")
        fields = {k: v for k, v in tool_input.items() if v is not None}
        if not fields:
            return {"error": "Nessun campo da aggiornare."}
        set_clauses = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        values = list(fields.values())
        row = await pool.fetchrow(
            f"UPDATE contacts SET {set_clauses}, updated_at = now() WHERE id = $1 AND user_id = ${len(values)+2} RETURNING id, name, phone",
            cid, *values, user_id,
        )
        if not row:
            return {"error": "Contatto non trovato."}
        return {"success": True, "contact": {"id": str(row["id"]), "name": row["name"], "phone": row["phone"]}}

    if tool_name == "delete_contact":
        cid = tool_input["contact_id"]
        result = await pool.execute(
            "DELETE FROM contacts WHERE id = $1 AND user_id = $2", cid, user_id,
        )
        deleted = result.split(" ")[-1] != "0"
        return {"success": deleted, "message": "Contatto eliminato." if deleted else "Contatto non trovato."}

    if tool_name == "import_contacts":
        contacts_data = tool_input["contacts"]
        imported = 0
        for c in contacts_data:
            tags = c.get("tags", "")
            tag_list = [t.strip() for t in tags.split(",")] if isinstance(tags, str) and tags else (tags if isinstance(tags, list) else [])
            row = await pool.fetchrow(
                """INSERT INTO contacts (user_id, phone, name, email, language, tags, opt_in, opt_in_date)
                   VALUES ($1, $2, $3, $4, $5, $6::text[], true, now())
                   ON CONFLICT (user_id, phone) DO NOTHING RETURNING id""",
                user_id, c["phone"], c.get("name"), c.get("email"),
                c.get("language", "it"), tag_list,
            )
            if row:
                imported += 1
        return {"imported": imported, "total": len(contacts_data)}

    # ── Campaigns ──
    if tool_name == "list_campaigns":
        status = tool_input.get("status")
        if status:
            rows = await pool.fetch(
                """SELECT id, name, status, template_id, stats, scheduled_at, started_at, completed_at, created_at
                   FROM campaigns WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC""",
                user_id, status,
            )
        else:
            rows = await pool.fetch(
                """SELECT id, name, status, template_id, stats, scheduled_at, started_at, completed_at, created_at
                   FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC""",
                user_id,
            )
        campaigns = []
        for r in rows:
            stats = r["stats"]
            if isinstance(stats, str):
                stats = json.loads(stats)
            campaigns.append({
                "id": str(r["id"]), "name": r["name"], "status": r["status"],
                "stats": stats or {}, "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return {"campaigns": campaigns}

    if tool_name == "get_campaign":
        cid = tool_input["campaign_id"]
        row = await pool.fetchrow(
            """SELECT c.*, t.name as template_name, t.category as template_category
               FROM campaigns c LEFT JOIN templates t ON t.id = c.template_id
               WHERE c.id = $1 AND c.user_id = $2""",
            cid, user_id,
        )
        if not row:
            return {"error": "Campagna non trovata."}
        stats = row["stats"]
        if isinstance(stats, str):
            stats = json.loads(stats)
        return {
            "id": str(row["id"]), "name": row["name"], "status": row["status"],
            "template_name": row["template_name"], "stats": stats or {},
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
        }

    if tool_name == "create_campaign":
        name = tool_input["name"]
        template_id = tool_input.get("template_id")
        group_id = tool_input.get("group_id")
        scheduled_at = tool_input.get("scheduled_at")
        status = "scheduled" if scheduled_at else "draft"
        row = await pool.fetchrow(
            """INSERT INTO campaigns (user_id, name, template_id, group_id, segment_query, status, scheduled_at)
               VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, $6)
               RETURNING id, name, status""",
            user_id, name, template_id, group_id, status, scheduled_at,
        )
        return {"success": True, "campaign": {"id": str(row["id"]), "name": row["name"], "status": row["status"]}}

    if tool_name == "update_campaign":
        cid = tool_input.pop("campaign_id")
        fields = {k: v for k, v in tool_input.items() if v is not None}
        if not fields:
            return {"error": "Nessun campo da aggiornare."}
        set_clauses = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        values = list(fields.values())
        row = await pool.fetchrow(
            f"UPDATE campaigns SET {set_clauses}, updated_at = now() WHERE id = $1 AND user_id = ${len(values)+2} AND status IN ('draft', 'scheduled') RETURNING id, name, status",
            cid, *values, user_id,
        )
        if not row:
            return {"error": "Campagna non trovata o non modificabile (solo bozze/programmate)."}
        return {"success": True, "campaign": {"id": str(row["id"]), "name": row["name"], "status": row["status"]}}

    if tool_name == "launch_campaign":
        cid = tool_input["campaign_id"]
        row = await pool.fetchrow(
            "SELECT id, status FROM campaigns WHERE id = $1 AND user_id = $2", cid, user_id,
        )
        if not row:
            return {"error": "Campagna non trovata."}
        if row["status"] not in ("draft", "scheduled"):
            return {"error": f"La campagna è in stato '{row['status']}', non può essere avviata."}
        await redis.enqueue_campaign(cid)
        return {"success": True, "message": f"Campagna '{cid}' accodata per l'invio."}

    if tool_name == "pause_campaign":
        await redis.pause(tool_input["campaign_id"])
        return {"success": True, "message": "Campagna messa in pausa."}

    if tool_name == "resume_campaign":
        cid = tool_input["campaign_id"]
        await redis.resume(cid)
        await redis.enqueue_campaign(cid)
        return {"success": True, "message": "Campagna ripresa."}

    # ── Templates ──
    if tool_name == "list_templates":
        rows = await pool.fetch(
            "SELECT id, name, language, category, created_at FROM templates WHERE user_id = $1 ORDER BY created_at DESC",
            user_id,
        )
        return {"templates": [
            {"id": str(r["id"]), "name": r["name"], "language": r["language"], "category": r["category"]}
            for r in rows
        ]}

    if tool_name == "get_template":
        tid = tool_input["template_id"]
        row = await pool.fetchrow(
            "SELECT * FROM templates WHERE id = $1 AND user_id = $2", tid, user_id,
        )
        if not row:
            return {"error": "Template non trovato."}
        components = row["components"]
        if isinstance(components, str):
            components = json.loads(components)
        return {"id": str(row["id"]), "name": row["name"], "language": row["language"], "category": row["category"], "components": components}

    if tool_name == "create_template":
        name = tool_input["name"]
        row = await pool.fetchrow(
            """INSERT INTO templates (user_id, name, category, language, components)
               VALUES ($1, $2, $3, $4, $5::jsonb)
               RETURNING id, name, category, language""",
            user_id, name, tool_input.get("category", "marketing"),
            tool_input.get("language", "it"),
            json.dumps(tool_input.get("components", [])),
        )
        return {"success": True, "template": {"id": str(row["id"]), "name": row["name"], "category": row["category"]}}

    if tool_name == "update_template":
        tid = tool_input.pop("template_id")
        fields = {}
        for k in ("name", "category", "language"):
            if k in tool_input and tool_input[k] is not None:
                fields[k] = tool_input[k]
        if "components" in tool_input and tool_input["components"] is not None:
            fields["components"] = json.dumps(tool_input["components"])
        if not fields:
            return {"error": "Nessun campo da aggiornare."}
        set_clauses = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        values = list(fields.values())
        row = await pool.fetchrow(
            f"UPDATE templates SET {set_clauses}, updated_at = now() WHERE id = $1 AND user_id = ${len(values)+2} RETURNING id, name",
            tid, *values, user_id,
        )
        if not row:
            return {"error": "Template non trovato."}
        return {"success": True, "template": {"id": str(row["id"]), "name": row["name"]}}

    if tool_name == "delete_template":
        tid = tool_input["template_id"]
        result = await pool.execute(
            "DELETE FROM templates WHERE id = $1 AND user_id = $2", tid, user_id,
        )
        deleted = result.split(" ")[-1] != "0"
        return {"success": deleted, "message": "Template eliminato." if deleted else "Template non trovato."}

    # ── Dashboard & Analytics ──
    if tool_name == "get_dashboard_stats":
        count_row = await pool.fetchrow(
            "SELECT count(*) FROM contacts WHERE user_id = $1 AND opt_in = true", user_id,
        )
        total_contacts = count_row["count"] if count_row else 0

        campaigns = await pool.fetch(
            "SELECT id, name, status, stats, started_at FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5",
            user_id,
        )
        total_sent = 0
        total_delivered = 0
        total_read = 0
        for c in campaigns:
            stats = c["stats"]
            if isinstance(stats, str):
                stats = json.loads(stats)
            if stats:
                total_sent += stats.get("sent", 0)
                total_delivered += stats.get("delivered", 0)
                total_read += stats.get("read", 0)

        return {
            "total_contacts": total_contacts,
            "messages_sent": total_sent,
            "delivery_rate": round(total_delivered / total_sent * 100) if total_sent > 0 else 0,
            "read_rate": round(total_read / total_sent * 100) if total_sent > 0 else 0,
            "recent_campaigns": [
                {"id": str(c["id"]), "name": c["name"], "status": c["status"]}
                for c in campaigns
            ],
        }

    if tool_name == "get_campaign_stats":
        cid = tool_input["campaign_id"]
        row = await pool.fetchrow(
            "SELECT name, status, stats FROM campaigns WHERE id = $1 AND user_id = $2", cid, user_id,
        )
        if not row:
            return {"error": "Campagna non trovata."}
        stats = row["stats"]
        if isinstance(stats, str):
            stats = json.loads(stats)
        return {"name": row["name"], "status": row["status"], "stats": stats or {}}

    if tool_name == "get_message_history":
        status = tool_input.get("status")
        campaign_id = tool_input.get("campaign_id")
        limit = tool_input.get("limit", 50)

        query = """SELECT m.id, m.status, m.sent_at, m.error, c.name as contact_name,
                          c.phone as contact_phone, camp.name as campaign_name
                   FROM messages m
                   JOIN contacts c ON c.id = m.contact_id
                   JOIN campaigns camp ON camp.id = m.campaign_id
                   WHERE camp.user_id = $1"""
        params: list = [user_id]
        idx = 2
        if status:
            query += f" AND m.status = ${idx}"
            params.append(status)
            idx += 1
        if campaign_id:
            query += f" AND m.campaign_id = ${idx}"
            params.append(campaign_id)
            idx += 1
        query += f" ORDER BY m.sent_at DESC NULLS LAST LIMIT ${idx}"
        params.append(limit)

        rows = await pool.fetch(query, *params)
        return {"messages": [
            {
                "id": str(r["id"]), "status": r["status"], "contact_name": r["contact_name"],
                "contact_phone": r["contact_phone"], "campaign_name": r["campaign_name"],
                "sent_at": r["sent_at"].isoformat() if r["sent_at"] else None,
                "error": r["error"],
            }
            for r in rows
        ]}

    # ── Settings ──
    if tool_name == "get_whatsapp_config":
        row = await pool.fetchrow(
            "SELECT phone_number_id, waba_id, business_name, default_language, verified FROM whatsapp_config WHERE user_id = $1",
            user_id,
        )
        if not row:
            return {"configured": False, "message": "WhatsApp non ancora configurato."}
        return {
            "configured": True,
            "phone_number_id": row["phone_number_id"],
            "waba_id": row["waba_id"],
            "business_name": row["business_name"],
            "default_language": row["default_language"],
            "verified": row["verified"],
        }

    if tool_name == "update_whatsapp_config":
        update = {
            "user_id": user_id,
            "phone_number_id": tool_input["phone_number_id"],
            "waba_id": tool_input["waba_id"],
            "business_name": tool_input.get("business_name"),
            "default_language": tool_input.get("default_language", "it"),
        }
        if tool_input.get("token"):
            from src.utils.encryption import encrypt
            update["encrypted_token"] = encrypt(tool_input["token"])

        cols = ", ".join(update.keys())
        vals = ", ".join(f"${i+1}" for i in range(len(update)))
        conflict = ", ".join(f"{k} = EXCLUDED.{k}" for k in update if k != "user_id")
        await pool.execute(
            f"INSERT INTO whatsapp_config ({cols}) VALUES ({vals}) ON CONFLICT (user_id) DO UPDATE SET {conflict}",
            *update.values(),
        )
        return {"success": True, "message": "Configurazione WhatsApp aggiornata."}

    if tool_name == "get_ai_config":
        row = await pool.fetchrow(
            "SELECT mode, model, temperature, max_tokens FROM ai_config WHERE user_id = $1",
            user_id,
        )
        if not row:
            return {"mode": "shared", "model": "claude-haiku-4-5-20251001", "temperature": 0.7, "max_tokens": 500}
        return {"mode": row["mode"], "model": row["model"], "temperature": float(row["temperature"]), "max_tokens": row["max_tokens"]}

    if tool_name == "update_ai_config":
        update = {"user_id": user_id, "mode": "shared"}
        if tool_input.get("model"):
            update["model"] = tool_input["model"]
        if tool_input.get("temperature") is not None:
            update["temperature"] = tool_input["temperature"]
        if tool_input.get("max_tokens") is not None:
            update["max_tokens"] = tool_input["max_tokens"]

        cols = ", ".join(update.keys())
        vals = ", ".join(f"${i+1}" for i in range(len(update)))
        conflict = ", ".join(f"{k} = EXCLUDED.{k}" for k in update if k != "user_id")
        await pool.execute(
            f"INSERT INTO ai_config ({cols}) VALUES ({vals}) ON CONFLICT (user_id) DO UPDATE SET {conflict}",
            *update.values(),
        )
        return {"success": True, "message": "Configurazione AI aggiornata."}

    if tool_name == "get_plan_usage":
        sub = await pool.fetchrow(
            "SELECT plan_id, status FROM subscriptions WHERE user_id = $1", user_id,
        )
        if not sub:
            return {"error": "Nessun abbonamento trovato."}
        plan = await pool.fetchrow("SELECT * FROM plans WHERE id = $1", sub["plan_id"])
        today = date.today().isoformat()
        usage = await pool.fetchrow(
            "SELECT campaigns_used, messages_used, contacts_count FROM usage_counters WHERE user_id = $1 AND period_start = $2",
            user_id, today,
        )
        return {
            "plan": plan["name"] if plan else "N/A",
            "limits": {
                "max_campaigns": plan["max_campaigns_month"] if plan else 0,
                "max_contacts": plan["max_contacts"] if plan else 0,
                "max_messages": plan["max_messages_month"] if plan else 0,
            },
            "usage": {
                "campaigns_used": usage["campaigns_used"] if usage else 0,
                "messages_used": usage["messages_used"] if usage else 0,
                "contacts_count": usage["contacts_count"] if usage else 0,
            },
            "subscription_status": sub["status"],
        }

    return {"error": f"Tool sconosciuto: {tool_name}"}


async def handle_chat(
    prompt: str,
    user_id: str,
    db: SupabaseMemory,
    redis: RedisMemory,
) -> dict:
    """Process a user chat prompt: call Claude with tools, execute tool, return response."""
    client = _get_client()

    if settings.mock_llm:
        return {"response": f"[mock] Ricevuto: {prompt}", "tool_calls": []}

    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        tools=CHAT_TOOLS,
        messages=[{"role": "user", "content": prompt}],
    )

    await log.ainfo("chat_claude_response", stop_reason=response.stop_reason)

    # If Claude responds with text only (no tool call)
    if response.stop_reason == "end_turn":
        text = "".join(b.text for b in response.content if b.type == "text")
        return {"response": text, "tool_calls": []}

    # If Claude wants to use a tool
    if response.stop_reason == "tool_use":
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                tool_name = block.name
                tool_input = block.input
                await log.ainfo("chat_tool_call", tool=tool_name, input=tool_input)

                result = await execute_tool(tool_name, tool_input, user_id, db, redis)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })

        # Send tool results back to Claude for a natural language summary
        follow_up = await client.messages.create(
            model=settings.claude_model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=CHAT_TOOLS,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": response.content},
                {"role": "user", "content": tool_results},
            ],
        )

        text = "".join(b.text for b in follow_up.content if b.type == "text")
        calls = [
            {"tool": b.name, "input": b.input}
            for b in response.content if b.type == "tool_use"
        ]
        return {"response": text, "tool_calls": calls}

    # Fallback
    text = "".join(b.text for b in response.content if b.type == "text")
    return {"response": text or "Non ho capito la richiesta.", "tool_calls": []}
```

- [ ] **Step 2: Verify syntax**

Run: `cd agent && python -c "import ast; ast.parse(open('src/agents/chat_handler.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add agent/src/agents/chat_handler.py
git commit -m "feat(agent): add chat handler with Claude tool_use orchestration"
```

---

## Task 3: Agent — Chat API Endpoint

**Files:**
- Create: `agent/src/api/endpoints/chat.py`
- Modify: `agent/src/api/router.py`
- Modify: `agent/src/main.py`

- [ ] **Step 1: Create the chat endpoint**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.dependencies import verify_agent_secret
from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory
from src.agents.chat_handler import handle_chat
from src.utils.telemetry import log

router = APIRouter(prefix="/chat", dependencies=[Depends(verify_agent_secret)])

_db: SupabaseMemory | None = None
_redis: RedisMemory | None = None


def set_resources(db: SupabaseMemory, redis: RedisMemory) -> None:
    global _db, _redis
    _db = db
    _redis = redis


class ChatRequest(BaseModel):
    prompt: str
    user_id: str


@router.post("")
async def chat(req: ChatRequest) -> dict:
    if not _db or not _redis:
        raise HTTPException(status_code=503, detail="Service not ready")

    await log.ainfo("chat_request", user_id=req.user_id, prompt_len=len(req.prompt))

    result = await handle_chat(req.prompt, req.user_id, _db, _redis)

    return result
```

- [ ] **Step 2: Register the chat router in `router.py`**

Modify `agent/src/api/router.py` — add the chat router import and include:

```python
from fastapi import APIRouter

from src.api.endpoints.health import router as health_router
from src.api.endpoints.campaigns import router as campaigns_router
from src.api.endpoints.chat import router as chat_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(campaigns_router, tags=["campaigns"])
api_router.include_router(chat_router, tags=["chat"])
```

- [ ] **Step 3: Wire resources in `main.py`**

Modify `agent/src/main.py` — import `set_resources` from chat and call it in lifespan:

```python
from src.api.endpoints.campaigns import set_resources as set_campaign_resources
from src.api.endpoints.chat import set_resources as set_chat_resources
```

In the lifespan, after `set_resources(_db, _redis)` add:

```python
set_campaign_resources(_db, _redis)
set_chat_resources(_db, _redis)
```

And update the existing `set_resources` import accordingly.

- [ ] **Step 4: Commit**

```bash
git add agent/src/api/endpoints/chat.py agent/src/api/router.py agent/src/main.py
git commit -m "feat(agent): add POST /chat endpoint and wire to app"
```

---

## Task 4: Frontend — Chat API Proxy

**Files:**
- Create: `frontend/src/app/api/agent/chat/route.ts`

- [ ] **Step 1: Create the proxy route**

This Next.js API route forwards the authenticated user's chat request to the agent service.

```typescript
import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/middleware/withAuth";

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const { prompt } = body;

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json(
      { error: "Il prompt è obbligatorio." },
      { status: 400 }
    );
  }

  const agentUrl = process.env.AGENT_URL || "http://localhost:8000";
  const agentSecret = process.env.AGENT_SECRET || "";

  const res = await fetch(`${agentUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Secret": agentSecret,
    },
    body: JSON.stringify({ prompt, user_id: req.user.id }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as Record<string, string>).detail || "Errore nella comunicazione con l'agent." },
      { status: 500 }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/api/agent/chat/route.ts
git commit -m "feat(frontend): add /api/agent/chat proxy route"
```

---

## Task 5: Frontend — Agent Page with Chat + Quick Prompts

**Files:**
- Rewrite: `frontend/src/app/(dashboard)/agent/page.tsx`

- [ ] **Step 1: Rewrite the agent page**

Replace the placeholder with a full chat interface + hardcoded prompts covering ALL operations.

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls?: Array<{ tool: string; input: Record<string, unknown> }>;
  loading?: boolean;
}

const PROMPT_CATEGORIES = [
  {
    name: "Contatti",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    prompts: [
      { label: "Lista tutti i contatti", prompt: "Mostrami tutti i contatti" },
      { label: "Cerca contatto", prompt: "Cerca i contatti con nome 'Marco'" },
      { label: "Filtra per tag", prompt: "Mostrami i contatti con tag 'vip'" },
      { label: "Aggiungi contatto", prompt: "Aggiungi un nuovo contatto: telefono +39 333 1234567, nome Mario Rossi, tag clienti,vip" },
      { label: "Aggiorna contatto", prompt: "Aggiorna il contatto con ID [ID] impostando il nome a 'Marco Bianchi'" },
      { label: "Elimina contatto", prompt: "Elimina il contatto con ID [ID]" },
      { label: "Importa contatti", prompt: "Importa questi contatti: +39 333 1111111 Anna Verdi, +39 333 2222222 Luca Neri" },
    ],
  },
  {
    name: "Campagne",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    prompts: [
      { label: "Lista campagne", prompt: "Mostrami tutte le campagne" },
      { label: "Campagne attive", prompt: "Quali campagne sono in corso?" },
      { label: "Campagne completate", prompt: "Mostrami le campagne completate" },
      { label: "Campagne in bozza", prompt: "Mostrami le campagne in bozza" },
      { label: "Dettagli campagna", prompt: "Mostrami i dettagli della campagna con ID [ID]" },
      { label: "Crea campagna", prompt: "Crea una nuova campagna chiamata 'Promo Primavera'" },
      { label: "Crea campagna con template", prompt: "Crea la campagna 'Newsletter Aprile' usando il template con ID [ID]" },
      { label: "Aggiorna campagna", prompt: "Aggiorna la campagna con ID [ID] cambiando il nome in 'Promo Estate'" },
      { label: "Avvia campagna", prompt: "Avvia la campagna con ID [ID]" },
      { label: "Pausa campagna", prompt: "Metti in pausa la campagna con ID [ID]" },
      { label: "Riprendi campagna", prompt: "Riprendi la campagna con ID [ID]" },
    ],
  },
  {
    name: "Template",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    prompts: [
      { label: "Lista template", prompt: "Mostrami tutti i template" },
      { label: "Dettagli template", prompt: "Mostrami i dettagli del template con ID [ID]" },
      { label: "Crea template marketing", prompt: "Crea un nuovo template chiamato 'Benvenuto' di categoria marketing in italiano" },
      { label: "Crea template utility", prompt: "Crea un template 'Conferma Ordine' di categoria utility" },
      { label: "Aggiorna template", prompt: "Aggiorna il template con ID [ID] cambiando il nome in 'Promo Nuova'" },
      { label: "Elimina template", prompt: "Elimina il template con ID [ID]" },
    ],
  },
  {
    name: "Dashboard & Analytics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
      </svg>
    ),
    prompts: [
      { label: "Panoramica dashboard", prompt: "Mostrami le statistiche della dashboard" },
      { label: "Statistiche campagna", prompt: "Mostrami le statistiche della campagna con ID [ID]" },
      { label: "Storico messaggi", prompt: "Mostrami lo storico degli ultimi messaggi" },
      { label: "Messaggi consegnati", prompt: "Mostrami i messaggi con stato 'delivered'" },
      { label: "Messaggi falliti", prompt: "Mostrami i messaggi falliti" },
      { label: "Messaggi letti", prompt: "Mostrami i messaggi letti" },
    ],
  },
  {
    name: "Impostazioni",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    prompts: [
      { label: "Config WhatsApp", prompt: "Mostrami la configurazione WhatsApp corrente" },
      { label: "Aggiorna WhatsApp", prompt: "Aggiorna la configurazione WhatsApp con Phone Number ID '123456' e WABA ID '789012'" },
      { label: "Config AI", prompt: "Mostrami la configurazione AI corrente" },
      { label: "Cambia modello AI", prompt: "Imposta il modello AI a Claude Sonnet 4" },
      { label: "Cambia temperatura", prompt: "Imposta la temperatura AI a 0.5" },
      { label: "Piano e utilizzo", prompt: "Mostrami il mio piano e l'utilizzo corrente" },
    ],
  },
];

let msgId = 0;

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendPrompt(prompt: string) {
    if (!prompt.trim() || sending) return;

    const userMsg: Message = { id: String(++msgId), role: "user", content: prompt };
    const loadingMsg: Message = { id: String(++msgId), role: "assistant", content: "", loading: true };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await apiFetch("/agent/chat", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === loadingMsg.id ? { ...m, content: data.error || "Errore nella risposta.", loading: false } : m))
        );
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, content: data.response, tool_calls: data.tool_calls, loading: false }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === loadingMsg.id ? { ...m, content: "Errore di connessione con l'agent.", loading: false } : m))
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendPrompt(input);
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-[15px] font-semibold text-brand-ink">Agent AI</h1>
        <p className="text-[11px] text-brand-ink-60">
          Assistente intelligente per gestire contatti, campagne e messaggi
        </p>
      </div>

      {/* Messages area or Quick Prompts */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-card border border-brand-teal/20 bg-brand-teal-pale p-4 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-brand-teal/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" className="h-5 w-5">
                  <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1.27A7 7 0 015.27 19H4a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
                  <circle cx="9" cy="14" r="1" fill="#0D9488" />
                  <circle cx="15" cy="14" r="1" fill="#0D9488" />
                </svg>
              </div>
              <p className="text-[13px] font-medium text-brand-teal-dark">
                Scrivi un messaggio o scegli un&apos;automazione rapida
              </p>
            </div>

            {/* Quick Prompts Grid */}
            {PROMPT_CATEGORIES.map((cat) => (
              <div key={cat.name}>
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-brand-ink">
                  <span className="text-brand-teal">{cat.icon}</span>
                  {cat.name}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.prompts.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => sendPrompt(p.prompt)}
                      disabled={sending}
                      className="rounded-pill border border-brand-ink-10 bg-white px-3 py-1.5 text-[11px] text-brand-ink-60 transition-colors hover:border-brand-teal hover:bg-brand-teal-pale hover:text-brand-teal-dark disabled:opacity-40"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-card px-4 py-3 text-[13px] ${
                    m.role === "user"
                      ? "bg-brand-green text-white"
                      : "border border-brand-ink-10 bg-white text-brand-ink shadow-card"
                  }`}
                >
                  {m.loading ? (
                    <div className="flex items-center gap-2 text-brand-ink-30">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-brand-teal" />
                      Sto pensando...
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                  {m.tool_calls && m.tool_calls.length > 0 && (
                    <div className="mt-2 border-t border-brand-ink-10 pt-2">
                      {m.tool_calls.map((tc, i) => (
                        <span
                          key={i}
                          className="mr-1 inline-block rounded-pill bg-brand-teal-pale px-2 py-0.5 text-[10px] font-medium text-brand-teal-dark"
                        >
                          {tc.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 border-t border-brand-ink-10 bg-white pt-3"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Scrivi un comando per l'agent AI..."
            disabled={sending}
            className="flex-1 rounded-sm border border-brand-ink-10 px-4 py-2.5 text-[13px] focus:border-brand-green focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="rounded-sm bg-brand-green px-5 py-2.5 text-[13px] font-medium text-white hover:bg-brand-green-dark disabled:opacity-40"
          >
            Invia
          </button>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="mt-2 text-[11px] text-brand-ink-30 hover:text-brand-ink-60"
          >
            Nuova conversazione
          </button>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page loads**

Run: `cd frontend && npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/agent/page.tsx
git commit -m "feat(frontend): replace agent placeholder with chat UI and quick prompts"
```

---

## Self-Review Results

**Spec coverage:** All frontend operations are mapped:
- Contacts: list, search, filter, add, update, delete, import (7 tools, 7 prompts)
- Campaigns: list, list-by-status, get, create, update, launch, pause, resume (8 tools, 11 prompts)
- Templates: list, get, create, update, delete (5 tools, 6 prompts)
- Dashboard/Analytics: dashboard stats, campaign stats, message history by status (3 tools, 6 prompts)
- Settings: WhatsApp get/update, AI get/update, plan/usage (5 tools, 6 prompts)
- **Total: 25 tools, 36 hardcoded prompts**

**Placeholder scan:** No TBDs, TODOs, or incomplete steps found.

**Type consistency:**
- `ChatRequest` model uses `prompt: str` and `user_id: str` — consistent across endpoint and handler
- `execute_tool` signature matches how it's called from `handle_chat`
- `CHAT_TOOLS` list is imported consistently
- `set_resources` pattern matches the existing campaigns endpoint pattern
- Frontend `apiFetch("/agent/chat")` matches the new route at `api/agent/chat/route.ts`
