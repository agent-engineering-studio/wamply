# Plan Tiers — Sub-project C: Admin Twilio Management Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un pannello admin `/admin?tab=twilio` per gestire le master credentials Twilio, la policy di provisioning, la lista subaccount con costi stimati e l'audit log — con gating via permission `admin.twilio.manage`.

**Architecture:** Migration Supabase 027 estende la tabella esistente `system_config` (riuso pattern `default_anthropic_api_key`) per salvare `twilio_master_auth_token_encrypted` e `twilio_provisioning_policy` (jsonb) e seeda la permission `admin.twilio.manage` in `role_permissions`. Quattro endpoint FastAPI dietro `require_permission("admin.twilio.manage")` leggono/mutano config + aggregano stats dai subaccount già presenti in `meta_applications`. Il tab frontend `AdminTwilioTab` (Next.js 15 client component, stile identico a `AISystemKeyTab`) espone 4 sezioni verticali. `AdminSidebar` ottiene la nuova voce `twilio` + entry in `TAB_PERMISSIONS`. Ogni mutazione scrive una riga su `audit_log` con `action` che inizia con `twilio_`.

**Tech Stack:** PostgreSQL (Supabase), FastAPI + asyncpg + httpx, Next.js 15 + TypeScript strict, Tailwind, pytest.

**Reference Spec:** `docs/superpowers/specs/2026-04-24-plan-tiers-and-positioning-design.md` §8 (admin Twilio management), §11 (pre-requisiti Meta), §12.3 (sub-project C scope).

---

## Hard dependencies (bloccanti)

- **`feature/admin-roles-permissions` mergiato**: fornisce `backend/src/auth/permissions.py::require_permission`, tabella `role_permissions`, tabella `audit_log`, `TAB_PERMISSIONS` map in `AdminSidebar.tsx`, `usePermissions/can` helpers, endpoint `/admin/me/permissions`.
- **Sub-project A mergiato** (`supabase/migrations/026_plan_restructure.sql`): fornisce colonne `overage_rates` + `msg_included` su `plans`, usate per il costo stimato aggregato nel Subaccount overview.
- **Migration 026 già applicata al DB**: Task 0 verifica il numero della migration successiva libera (deve essere **027**).

Se una di queste dipendenze non è ancora presente al momento dell'esecuzione, **STOP**: non procedere, ripristina prima il branch base. Task 0 include lo script di verifica.

---

## File Structure

**Create:**
- `supabase/migrations/027_admin_twilio_config.sql`
- `backend/src/services/twilio_admin.py`
- `backend/src/api/admin_twilio.py`
- `backend/tests/test_admin_twilio_permission.py`
- `backend/tests/test_admin_twilio_overview.py`
- `backend/tests/test_admin_twilio_policy.py`
- `backend/tests/test_admin_twilio_rotate.py`
- `backend/tests/test_admin_twilio_suspend.py`
- `frontend/src/app/(admin)/admin/_components/AdminTwilioTab.tsx`
- `frontend/e2e/admin-twilio-tab.spec.ts`

**Modify:**
- `backend/src/api/router.py` — include `admin_twilio.router`
- `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx` — aggiungi `twilio` ad `AdminTab`, `TAB_PERMISSIONS`, `NAV_SECTIONS`
- `frontend/src/app/(admin)/admin/page.tsx` — aggiungi `twilio` a `VALID_TABS` + render `<AdminTwilioTab />`

---

## Task 0: Pre-flight dependency check

- [ ] **Step 1: Verifica branch base corrente**

```bash
cd c:/Users/GiuseppeZileni/Git/wamply
git branch --show-current
# Expected: feature/plan-tiers-positioning
```

- [ ] **Step 2: Verifica che le dipendenze hard siano presenti**

```bash
# Must exist: require_permission factory
test -f backend/src/auth/permissions.py && grep -q "def require_permission" backend/src/auth/permissions.py \
  && echo "OK: require_permission present" || echo "FAIL: merge feature/admin-roles-permissions first"

# Must exist: role_permissions + audit_log migration
ls supabase/migrations/019_role_permissions_and_audit_log.sql \
  && echo "OK: role_permissions migration present" || echo "FAIL: merge admin-roles branch"

# Must exist: sub-A migration 026
ls supabase/migrations/026_plan_restructure.sql \
  && echo "OK: sub-A migration present" || echo "FAIL: merge sub-A first"

# Must exist: TAB_PERMISSIONS map in sidebar
grep -q "TAB_PERMISSIONS" frontend/src/app/\(admin\)/admin/_components/AdminSidebar.tsx \
  && echo "OK: TAB_PERMISSIONS map present" || echo "FAIL: merge admin-roles branch"
```

Se una verifica fallisce, **STOP** e notifica il controller. Non creare fallback inline: le dipendenze sono strutturali.

- [ ] **Step 3: Verifica che la migration 027 sia disponibile (non occupata)**

```bash
test ! -f supabase/migrations/027_admin_twilio_config.sql \
  && echo "OK: 027 available" || echo "FAIL: 027 already taken — pick next free number"
```

---

## Task 1: DB migration — extend system_config + seed permission

**Files:**
- Create: `supabase/migrations/027_admin_twilio_config.sql`

- [ ] **Step 1: Crea la migration**

```sql
-- 027_admin_twilio_config.sql
-- Sub-project C (plan-tiers-positioning): admin Twilio management.
--
-- Riuso la tabella system_config già esistente (key/value) — chiavi:
--   * twilio_master_auth_token_encrypted : ciphertext del token master (AES-GCM,
--     formato iv:tag:ct come in src/services/encryption.py)
--   * twilio_master_account_sid          : SID master in chiaro (non è un segreto)
--   * twilio_master_messaging_service_sid: MSS default (non è un segreto)
--   * twilio_provisioning_policy         : JSON con {auto_create_subaccount_on_signup: bool,
--                                           default_region: text, number_pool: text[]}
--
-- Seeda anche la permission 'admin.twilio.manage' — coperta dal wildcard '*'
-- di admin, ma la inserisce esplicitamente come riga per:
--   1. Documentare in DB che esiste
--   2. Permettere query di introspezione (GET /admin/me/permissions la restituirà
--      se l'admin è chiamante, via il wildcard)
--   3. Facilitare test automatici che enumerano le permission attese.

BEGIN;

-- 1. Provisioning policy default (solo se non presente)
INSERT INTO system_config (key, value, updated_at)
VALUES (
  'twilio_provisioning_policy',
  '{"auto_create_subaccount_on_signup": true, "default_region": "IT", "number_pool": []}',
  now()
)
ON CONFLICT (key) DO NOTHING;

-- 2. NB: twilio_master_auth_token_encrypted NON viene seedato qui.
--    Il backend lo popola al primo POST /admin/twilio/rotate-master.
--    Fino ad allora, il valore ENV TWILIO_AUTH_TOKEN resta l'unico usato
--    (retro-compat con src/services/twilio_provisioning.py::_master_credentials).

-- 3. Permission row (per introspection — admin coperto comunque da wildcard '*')
INSERT INTO role_permissions (role, permission) VALUES
  ('admin', 'admin.twilio.manage')
ON CONFLICT (role, permission) DO NOTHING;

-- 4. Indice opzionale: audit_log query filtered by 'twilio_*' action prefix
CREATE INDEX IF NOT EXISTS audit_log_twilio_action_idx
  ON audit_log (created_at DESC)
  WHERE action LIKE 'twilio_%';

COMMIT;
```

- [ ] **Step 2: Applica la migration**

```bash
MSYS_NO_PATHCONV=1 docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres < supabase/migrations/027_admin_twilio_config.sql
```

Expected: no errors, `COMMIT` finale.

- [ ] **Step 3: Verifica il seed**

```bash
MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres -c "
    SELECT key, substring(value, 1, 80) AS value_preview
    FROM system_config
    WHERE key LIKE 'twilio_%';
    SELECT role, permission
    FROM role_permissions
    WHERE permission = 'admin.twilio.manage';
  "
```

Expected: riga `twilio_provisioning_policy` con JSON previsto + riga `(admin, admin.twilio.manage)`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/027_admin_twilio_config.sql
git commit -m "feat(db): add admin Twilio config keys and admin.twilio.manage permission"
```

---

## Task 2: Backend service — twilio_admin (TDD scaffold)

**Files:**
- Create: `backend/src/services/twilio_admin.py`

Questo modulo isola la logica di business (read/write config, stats aggregate, mask token, call Twilio API per suspend) dalla HTTP layer. Gli endpoint in Task 3-6 lo usano e lo mockano nei test unit.

- [ ] **Step 1: Crea il service**

```python
"""Admin-side Twilio management: read/write master config, aggregate
subaccount stats, rotate credentials, suspend subaccounts.

Le master credentials restano in ENV fino alla prima rotate. Dopo la rotate,
system_config diventa la source of truth (encrypted). `resolve_master_credentials`
prova DB-first, poi ENV-fallback.
"""
from __future__ import annotations

import json
import os
from typing import Any

import asyncpg
import httpx
import structlog
from fastapi import HTTPException

from src.services.encryption import encrypt, decrypt
from src.services.twilio_provisioning import _auth_header, TWILIO_API_BASE, HTTP_TIMEOUT

logger = structlog.get_logger()

# Keys in system_config
KEY_MASTER_SID = "twilio_master_account_sid"
KEY_MASTER_TOKEN = "twilio_master_auth_token_encrypted"
KEY_MASTER_MSS = "twilio_master_messaging_service_sid"
KEY_POLICY = "twilio_provisioning_policy"


def mask_token(token: str) -> str:
    """Restituisce una rappresentazione sicura del token (first 4 + last 4).

    Non espone MAI il token intero — anche dietro permission, non attraversa
    il network in chiaro."""
    if not token:
        return ""
    if len(token) <= 8:
        return "•" * len(token)
    return f"{token[:4]}{'•' * 8}{token[-4:]}"


async def _get_config(db: asyncpg.Pool, key: str) -> str | None:
    row = await db.fetchrow("SELECT value FROM system_config WHERE key = $1", key)
    return row["value"] if row else None


async def _set_config(db: asyncpg.Pool, key: str, value: str) -> None:
    await db.execute(
        """INSERT INTO system_config (key, value, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
        key, value,
    )


async def resolve_master_credentials(db: asyncpg.Pool) -> tuple[str, str]:
    """DB-first, ENV-fallback. Return (sid, auth_token) in chiaro per chiamate
    server-to-Twilio. Raise 503 se nessuna fonte disponibile."""
    sid = await _get_config(db, KEY_MASTER_SID) or os.getenv("TWILIO_ACCOUNT_SID") or ""
    enc = await _get_config(db, KEY_MASTER_TOKEN)
    if enc:
        token = decrypt(enc)
    else:
        token = os.getenv("TWILIO_AUTH_TOKEN") or ""
    if not sid or not token:
        raise HTTPException(
            status_code=503,
            detail="Twilio master credentials non configurate (DB vuoto e ENV assente).",
        )
    return sid, token


async def read_policy(db: asyncpg.Pool) -> dict:
    raw = await _get_config(db, KEY_POLICY)
    if not raw:
        return {"auto_create_subaccount_on_signup": True, "default_region": "IT", "number_pool": []}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("twilio_policy_invalid_json", raw=raw[:120])
        return {"auto_create_subaccount_on_signup": True, "default_region": "IT", "number_pool": []}


async def update_policy(db: asyncpg.Pool, patch: dict[str, Any]) -> dict:
    """Merge-patch sulla policy. Campi accettati:
       auto_create_subaccount_on_signup (bool), default_region (str), number_pool (list[str])."""
    current = await read_policy(db)
    allowed = {"auto_create_subaccount_on_signup", "default_region", "number_pool"}
    for k, v in patch.items():
        if k not in allowed:
            raise HTTPException(status_code=400, detail=f"Campo policy non ammesso: {k}")
        current[k] = v
    await _set_config(db, KEY_POLICY, json.dumps(current))
    return current


async def rotate_master_token(db: asyncpg.Pool, new_token: str, new_sid: str | None = None) -> None:
    """Salva il nuovo token criptato + eventualmente il nuovo SID. NO echo in output."""
    if not new_token or len(new_token) < 20:
        raise HTTPException(status_code=400, detail="Auth token non valido (minimo 20 caratteri).")
    await _set_config(db, KEY_MASTER_TOKEN, encrypt(new_token))
    if new_sid:
        await _set_config(db, KEY_MASTER_SID, new_sid)


async def aggregate_subaccount_stats(db: asyncpg.Pool) -> list[dict]:
    """Lista subaccount + msg mese in corso + costo stimato (usa overage_rates dal piano).

    Usa solo subaccount registrati in meta_applications (v. migration 022).
    msg mese: somma da usage_counters del period corrente.
    costo stimato: msg × rate media ponderata marketing/utility/free_form dal piano."""
    rows = await db.fetch(
        """SELECT
               ma.twilio_subaccount_sid AS sid,
               b.user_id,
               u.email,
               u.full_name,
               COALESCE(uc.messages_used, 0) AS messages_used,
               p.overage_rates,
               ma.status::text AS status
           FROM meta_applications ma
           JOIN businesses b ON b.id = ma.business_id
           JOIN users u ON u.id = b.user_id
           LEFT JOIN usage_counters uc
             ON uc.user_id = b.user_id
             AND uc.period_start = date_trunc('month', now())::date
           LEFT JOIN subscriptions s
             ON s.user_id = b.user_id AND s.status = 'active'
           LEFT JOIN plans p ON p.id = s.plan_id
           WHERE ma.twilio_subaccount_sid IS NOT NULL
           ORDER BY messages_used DESC"""
    )
    result = []
    for r in rows:
        rates = dict(r["overage_rates"] or {})
        # Mix 40/40/20 come da spec §5.1
        avg_rate = (
            0.40 * float(rates.get("marketing", 0.09))
            + 0.40 * float(rates.get("utility", 0.05))
            + 0.20 * float(rates.get("free_form", 0.01))
        )
        est_cost = round(int(r["messages_used"]) * avg_rate, 2)
        result.append({
            "subaccount_sid": r["sid"],
            "user_id": str(r["user_id"]),
            "email": r["email"],
            "full_name": r["full_name"],
            "messages_month": int(r["messages_used"]),
            "est_cost_eur": est_cost,
            "status": r["status"],
        })
    return result


async def suspend_subaccount(db: asyncpg.Pool, subaccount_sid: str) -> dict:
    """Kill-switch: POST /Accounts/{sid}.json Status=suspended con master creds."""
    master_sid, master_token = await resolve_master_credentials(db)
    url = f"{TWILIO_API_BASE}/Accounts/{subaccount_sid}.json"
    headers = {"Authorization": _auth_header(master_sid, master_token)}
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.post(url, headers=headers, data={"Status": "suspended"})
    if response.status_code >= 400:
        logger.warning("twilio_suspend_failed", sid=subaccount_sid, status=response.status_code, body=response.text[:200])
        raise HTTPException(
            status_code=502,
            detail=f"Errore Twilio durante sospensione ({response.status_code}).",
        )
    return response.json()


async def audit(db: asyncpg.Pool, actor_id: str, action: str, target_id: str | None, metadata: dict | None = None) -> None:
    """Scrive una riga in audit_log. action DEVE iniziare con 'twilio_'."""
    assert action.startswith("twilio_"), "action deve iniziare con 'twilio_' per coerenza filtro UI"
    await db.execute(
        """INSERT INTO audit_log (actor_id, action, target_id, metadata)
           VALUES ($1, $2, $3, $4)""",
        actor_id, action, target_id, json.dumps(metadata or {}),
    )
```

- [ ] **Step 2: Smoke import**

```bash
cd backend && python -c "from src.services.twilio_admin import mask_token, KEY_POLICY; print(mask_token('abcdefghijklmnop'))"
```

Expected: `abcd••••••••mnop`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/twilio_admin.py
git commit -m "feat(backend): add twilio_admin service (config, stats, rotate, suspend)"
```

---

## Task 3: Backend endpoint — GET /admin/twilio/overview (TDD)

**Files:**
- Create: `backend/src/api/admin_twilio.py`
- Create: `backend/tests/test_admin_twilio_overview.py`
- Modify: `backend/src/api/router.py`

- [ ] **Step 1: Scrivi il test (fallisce prima dell'implementazione)**

Create `backend/tests/test_admin_twilio_overview.py`:

```python
"""Integration test per GET /admin/twilio/overview.
Richiede: ADMIN_JWT + backend running. Pattern identico a test_admin_role_change.py."""
import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


def test_overview_returns_config_and_policy():
    r = httpx.get(f"{BASE}/admin/twilio/overview", headers=_hdr())
    assert r.status_code == 200
    body = r.json()
    assert "master" in body
    assert "policy" in body
    assert "subaccounts" in body
    assert "connection_ok" in body
    # auth_token must be masked or absent — never in chiaro
    master = body["master"]
    if "auth_token_masked" in master:
        assert "•" in master["auth_token_masked"] or master["auth_token_masked"] == ""
    assert "auth_token" not in master  # plain token must NEVER leak


def test_overview_policy_shape():
    r = httpx.get(f"{BASE}/admin/twilio/overview", headers=_hdr())
    policy = r.json()["policy"]
    assert "auto_create_subaccount_on_signup" in policy
    assert "default_region" in policy
    assert "number_pool" in policy


def test_overview_subaccounts_is_list():
    r = httpx.get(f"{BASE}/admin/twilio/overview", headers=_hdr())
    subs = r.json()["subaccounts"]
    assert isinstance(subs, list)
    for s in subs:
        assert "subaccount_sid" in s
        assert "messages_month" in s
        assert "est_cost_eur" in s
```

- [ ] **Step 2: Esegui il test (deve fallire con 404)**

```bash
cd backend && python -m pytest tests/test_admin_twilio_overview.py -v
```

Expected: skipped (no ADMIN_JWT) OR 404 Not Found.

- [ ] **Step 3: Crea il router + endpoint**

Create `backend/src/api/admin_twilio.py`:

```python
"""Admin Twilio management endpoints.

Tutti gli endpoint sono dietro require_permission("admin.twilio.manage").
Ogni mutazione scrive una riga audit_log con action prefissata 'twilio_'."""
import os
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser
from src.auth.permissions import require_permission
from src.dependencies import get_db
from src.services import twilio_admin
from src.services.twilio_provisioning import TWILIO_API_BASE, HTTP_TIMEOUT, _auth_header

logger = structlog.get_logger()

router = APIRouter(prefix="/admin/twilio")


async def _connection_ok(sid: str, token: str) -> bool:
    """Ping Twilio GET /Accounts/{sid}.json to verify creds."""
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            r = await client.get(
                f"{TWILIO_API_BASE}/Accounts/{sid}.json",
                headers={"Authorization": _auth_header(sid, token)},
            )
        return r.status_code == 200
    except Exception as exc:
        logger.warning("twilio_ping_failed", error=str(exc))
        return False


@router.get("/overview")
async def admin_twilio_overview(
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.twilio.manage")),
):
    db = get_db(request)
    sid = await twilio_admin._get_config(db, twilio_admin.KEY_MASTER_SID) or os.getenv("TWILIO_ACCOUNT_SID") or ""
    enc = await twilio_admin._get_config(db, twilio_admin.KEY_MASTER_TOKEN)
    # Per il ping risolviamo le creds complete (usa fallback ENV se DB vuoto)
    try:
        ping_sid, ping_token = await twilio_admin.resolve_master_credentials(db)
        connection_ok = await _connection_ok(ping_sid, ping_token)
        token_masked = twilio_admin.mask_token(ping_token)
    except HTTPException:
        connection_ok = False
        token_masked = ""
    mss = await twilio_admin._get_config(db, twilio_admin.KEY_MASTER_MSS) or os.getenv("TWILIO_MESSAGING_SERVICE_SID") or ""
    policy = await twilio_admin.read_policy(db)
    subaccounts = await twilio_admin.aggregate_subaccount_stats(db)
    return {
        "master": {
            "account_sid": sid,
            "auth_token_masked": token_masked,
            "auth_token_source": "db" if enc else ("env" if os.getenv("TWILIO_AUTH_TOKEN") else "none"),
            "messaging_service_sid": mss,
        },
        "policy": policy,
        "subaccounts": subaccounts,
        "connection_ok": connection_ok,
    }
```

- [ ] **Step 4: Registra il router**

Verifica il file `backend/src/api/router.py` e aggiungi l'import + l'include:

```python
from src.api import admin_twilio  # nuovo
# ...
app.include_router(admin_twilio.router, tags=["admin-twilio"])
```

(Se `router.py` usa pattern con `APIRouter` che aggrega sottorouter invece di `app.include_router`, inserisci coerentemente nel punto in cui sono già registrati `admin.router` e simili. Verifica con `grep -n "admin.router\|include_router" backend/src/api/router.py` prima di modificare.)

- [ ] **Step 5: Restart backend e verifica**

```bash
docker compose restart backend
sleep 3
cd backend && python -m pytest tests/test_admin_twilio_overview.py -v
```

Expected: skipped senza JWT; 200 + shape attesa con JWT.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/admin_twilio.py backend/src/api/router.py \
        backend/tests/test_admin_twilio_overview.py
git commit -m "feat(backend): add GET /admin/twilio/overview endpoint"
```

---

## Task 4: Backend endpoint — PATCH /admin/twilio/policy (TDD)

**Files:**
- Modify: `backend/src/api/admin_twilio.py`
- Create: `backend/tests/test_admin_twilio_policy.py`

- [ ] **Step 1: Scrivi il test**

Create `backend/tests/test_admin_twilio_policy.py`:

```python
import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


def test_patch_policy_updates_autocreate():
    r = httpx.patch(
        f"{BASE}/admin/twilio/policy",
        headers=_hdr(),
        json={"auto_create_subaccount_on_signup": False},
    )
    assert r.status_code == 200
    assert r.json()["policy"]["auto_create_subaccount_on_signup"] is False
    # ripristina
    httpx.patch(f"{BASE}/admin/twilio/policy", headers=_hdr(),
                json={"auto_create_subaccount_on_signup": True})


def test_patch_policy_rejects_unknown_field():
    r = httpx.patch(
        f"{BASE}/admin/twilio/policy",
        headers=_hdr(),
        json={"evil_field": "payload"},
    )
    assert r.status_code == 400


def test_patch_policy_number_pool():
    r = httpx.patch(
        f"{BASE}/admin/twilio/policy",
        headers=_hdr(),
        json={"number_pool": ["+3902XXX", "+3906YYY"]},
    )
    assert r.status_code == 200
    assert r.json()["policy"]["number_pool"] == ["+3902XXX", "+3906YYY"]
    httpx.patch(f"{BASE}/admin/twilio/policy", headers=_hdr(), json={"number_pool": []})
```

- [ ] **Step 2: Esegui (fallisce con 404)**

```bash
cd backend && python -m pytest tests/test_admin_twilio_policy.py -v
```

- [ ] **Step 3: Aggiungi l'endpoint**

Append a `backend/src/api/admin_twilio.py`:

```python
@router.patch("/policy")
async def admin_twilio_patch_policy(
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.twilio.manage")),
):
    db = get_db(request)
    body: dict[str, Any] = await request.json()
    if not isinstance(body, dict) or not body:
        raise HTTPException(status_code=400, detail="Body JSON non valido.")
    updated = await twilio_admin.update_policy(db, body)
    await twilio_admin.audit(
        db, actor_id=str(user.id), action="twilio_policy_updated",
        target_id=None, metadata={"patch": body},
    )
    return {"policy": updated}
```

- [ ] **Step 4: Restart + re-run tests**

```bash
docker compose restart backend
sleep 3
cd backend && python -m pytest tests/test_admin_twilio_policy.py -v
```

Expected: 3 passed con JWT, altrimenti skipped.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/admin_twilio.py backend/tests/test_admin_twilio_policy.py
git commit -m "feat(backend): add PATCH /admin/twilio/policy endpoint"
```

---

## Task 5: Backend endpoint — POST /admin/twilio/rotate-master (TDD)

**Files:**
- Modify: `backend/src/api/admin_twilio.py`
- Create: `backend/tests/test_admin_twilio_rotate.py`

- [ ] **Step 1: Scrivi il test**

Create `backend/tests/test_admin_twilio_rotate.py`:

```python
import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
# Test token fittizio — NON uso una vera Twilio creds in CI
TEST_TOKEN = os.getenv("TWILIO_TEST_TOKEN", "fake-token-12345678901234567890")

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


def test_rotate_stores_encrypted_token_and_returns_no_plain():
    r = httpx.post(
        f"{BASE}/admin/twilio/rotate-master",
        headers=_hdr(),
        json={"auth_token": TEST_TOKEN},
    )
    assert r.status_code == 200
    body = r.json()
    # NON deve mai echoed il token in chiaro
    assert "auth_token" not in body
    assert body.get("ok") is True
    assert "•" in body.get("auth_token_masked", "")


def test_rotate_rejects_short_token():
    r = httpx.post(
        f"{BASE}/admin/twilio/rotate-master",
        headers=_hdr(),
        json={"auth_token": "short"},
    )
    assert r.status_code == 400


def test_rotate_audit_log_row_written():
    # Effettua una rotazione
    httpx.post(f"{BASE}/admin/twilio/rotate-master", headers=_hdr(),
               json={"auth_token": TEST_TOKEN})
    # Verifica che GET /admin/twilio/overview esponga source='db'
    r = httpx.get(f"{BASE}/admin/twilio/overview", headers=_hdr())
    assert r.json()["master"]["auth_token_source"] == "db"
```

- [ ] **Step 2: Esegui (fallisce)**

```bash
cd backend && python -m pytest tests/test_admin_twilio_rotate.py -v
```

- [ ] **Step 3: Aggiungi l'endpoint**

Append a `backend/src/api/admin_twilio.py`:

```python
@router.post("/rotate-master")
async def admin_twilio_rotate_master(
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.twilio.manage")),
):
    db = get_db(request)
    body = await request.json()
    new_token = (body or {}).get("auth_token", "").strip()
    new_sid = (body or {}).get("account_sid")
    if new_sid is not None:
        new_sid = str(new_sid).strip() or None
    await twilio_admin.rotate_master_token(db, new_token, new_sid)
    await twilio_admin.audit(
        db, actor_id=str(user.id), action="twilio_master_rotated",
        target_id=None,
        metadata={"sid_changed": bool(new_sid), "token_masked": twilio_admin.mask_token(new_token)},
    )
    return {"ok": True, "auth_token_masked": twilio_admin.mask_token(new_token)}
```

- [ ] **Step 4: Re-test**

```bash
docker compose restart backend
sleep 3
cd backend && python -m pytest tests/test_admin_twilio_rotate.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/admin_twilio.py backend/tests/test_admin_twilio_rotate.py
git commit -m "feat(backend): add POST /admin/twilio/rotate-master endpoint"
```

---

## Task 6: Backend endpoint — POST /admin/twilio/subaccount/{sid}/suspend (TDD)

**Files:**
- Modify: `backend/src/api/admin_twilio.py`
- Create: `backend/tests/test_admin_twilio_suspend.py`

- [ ] **Step 1: Scrivi il test (unit con monkeypatch su suspend_subaccount)**

Create `backend/tests/test_admin_twilio_suspend.py`:

```python
"""Unit test per POST /admin/twilio/subaccount/{sid}/suspend.
Mocca la chiamata Twilio per evitare hit reale su API in CI."""
import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
# SID fittizio — non deve esistere su Twilio prod
FAKE_SID = "ACfake00000000000000000000000000"

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


def test_suspend_returns_502_on_unknown_sid():
    # Con un SID inventato, Twilio risponde 404 → il servizio lo rimappa in 502.
    r = httpx.post(f"{BASE}/admin/twilio/subaccount/{FAKE_SID}/suspend", headers=_hdr())
    assert r.status_code in (502, 503)


def test_suspend_requires_permission():
    # Chiamata senza auth → 401/403
    r = httpx.post(f"{BASE}/admin/twilio/subaccount/{FAKE_SID}/suspend")
    assert r.status_code in (401, 403)
```

- [ ] **Step 2: Esegui (fallisce 404)**

```bash
cd backend && python -m pytest tests/test_admin_twilio_suspend.py -v
```

- [ ] **Step 3: Aggiungi l'endpoint**

Append a `backend/src/api/admin_twilio.py`:

```python
@router.post("/subaccount/{subaccount_sid}/suspend")
async def admin_twilio_suspend_subaccount(
    subaccount_sid: str,
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.twilio.manage")),
):
    db = get_db(request)
    # Sanity check sul formato SID Twilio (AC + 32 hex)
    if not subaccount_sid.startswith("AC") or len(subaccount_sid) != 34:
        raise HTTPException(status_code=400, detail="SID subaccount non valido.")
    result = await twilio_admin.suspend_subaccount(db, subaccount_sid)
    await twilio_admin.audit(
        db, actor_id=str(user.id), action="twilio_subaccount_suspended",
        target_id=None, metadata={"subaccount_sid": subaccount_sid},
    )
    return {"ok": True, "status": result.get("status")}
```

- [ ] **Step 4: Re-test**

```bash
docker compose restart backend
sleep 3
cd backend && python -m pytest tests/test_admin_twilio_suspend.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/admin_twilio.py backend/tests/test_admin_twilio_suspend.py
git commit -m "feat(backend): add POST /admin/twilio/subaccount/{sid}/suspend endpoint"
```

---

## Task 7: Backend — test enforcement permission (TDD)

**Files:**
- Create: `backend/tests/test_admin_twilio_permission.py`

Verifica che i 4 endpoint rifiutino caller con role non-admin (collaborator, sales, user).

- [ ] **Step 1: Crea il test**

Create `backend/tests/test_admin_twilio_permission.py`:

```python
"""Verifica che admin.twilio.manage sia gated a role=admin.
Richiede tre JWT distinti: ADMIN_JWT, COLLAB_JWT, SALES_JWT."""
import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
COLLAB_JWT = os.getenv("COLLAB_JWT", "")
SALES_JWT = os.getenv("SALES_JWT", "")

pytestmark = pytest.mark.skipif(
    not (ADMIN_JWT and COLLAB_JWT and SALES_JWT),
    reason="ADMIN_JWT, COLLAB_JWT, SALES_JWT required",
)

ENDPOINTS = [
    ("GET", "/admin/twilio/overview", None),
    ("PATCH", "/admin/twilio/policy", {"default_region": "IT"}),
    ("POST", "/admin/twilio/rotate-master", {"auth_token": "x" * 30}),
    ("POST", "/admin/twilio/subaccount/ACfake00000000000000000000000000/suspend", None),
]


def _req(method: str, path: str, token: str, body):
    with httpx.Client(base_url=BASE) as c:
        return c.request(method, path, headers={"Authorization": f"Bearer {token}"}, json=body)


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_admin_allowed(method, path, body):
    r = _req(method, path, ADMIN_JWT, body)
    # 200 / 400 / 502 / 503 sono tutti *non* 403 → permission passed
    assert r.status_code != 403


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_collaborator_forbidden(method, path, body):
    r = _req(method, path, COLLAB_JWT, body)
    assert r.status_code == 403


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_sales_forbidden(method, path, body):
    r = _req(method, path, SALES_JWT, body)
    assert r.status_code == 403
```

- [ ] **Step 2: Esegui**

```bash
cd backend && python -m pytest tests/test_admin_twilio_permission.py -v
```

Expected: 12 passed (4 endpoint × 3 role) o tutti skipped in CI senza i 3 JWT.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_admin_twilio_permission.py
git commit -m "test(backend): verify admin.twilio.manage permission enforcement"
```

---

## Task 8: Frontend — AdminSidebar update (twilio nav entry)

**Files:**
- Modify: `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx`

- [ ] **Step 1: Aggiungi `twilio` a `AdminTab` type**

Edit in `AdminSidebar.tsx`:

```typescript
export type AdminTab =
  | "overview"
  | "users"
  | "staff"
  | "campaigns"
  | "whatsapp"
  | "twilio"        // nuovo
  | "ai_costs"
  | "ai_revenue"
  | "ai_key";
```

- [ ] **Step 2: Aggiungi la riga a `TAB_PERMISSIONS`**

```typescript
export const TAB_PERMISSIONS: Record<AdminTab, string> = {
  overview: "admin.overview.view",
  users: "admin.users.view",
  staff: "admin.staff.manage",
  campaigns: "admin.campaigns.view",
  whatsapp: "admin.whatsapp.manage",
  twilio: "admin.twilio.manage",   // nuovo
  ai_costs: "admin.ai_costs.view",
  ai_revenue: "admin.ai_revenue.view",
  ai_key: "admin.ai_key.configure",
};
```

- [ ] **Step 3: Aggiungi nav item nella sezione "Operatività"**

Sotto `whatsapp`, dentro la sezione `title: "Operatività"`:

```tsx
{
  tab: "twilio",
  label: "Twilio",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_CLASS}>
      <path d="M4 4h16v16H4z" />
      <circle cx="9" cy="10" r="1.5" />
      <circle cx="15" cy="10" r="1.5" />
      <circle cx="9" cy="15" r="1.5" />
      <circle cx="15" cy="15" r="1.5" />
    </svg>
  ),
},
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errori.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/_components/AdminSidebar.tsx
git commit -m "feat(admin): add Twilio tab nav entry gated by admin.twilio.manage"
```

---

## Task 9: Frontend — AdminTwilioTab component (4 sezioni)

**Files:**
- Create: `frontend/src/app/(admin)/admin/_components/AdminTwilioTab.tsx`

- [ ] **Step 1: Crea il componente**

Create `AdminTwilioTab.tsx` (stile analogo a `AISystemKeyTab`):

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface SubaccountRow {
  subaccount_sid: string;
  user_id: string;
  email: string;
  full_name: string | null;
  messages_month: number;
  est_cost_eur: number;
  status: string | null;
}

interface Policy {
  auto_create_subaccount_on_signup: boolean;
  default_region: string;
  number_pool: string[];
}

interface OverviewResponse {
  master: {
    account_sid: string;
    auth_token_masked: string;
    auth_token_source: "db" | "env" | "none";
    messaging_service_sid: string;
  };
  policy: Policy;
  subaccounts: SubaccountRow[];
  connection_ok: boolean;
}

interface AuditRow {
  id: string;
  action: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function AdminTwilioTab() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [rotateDraft, setRotateDraft] = useState("");
  const [rotateSaving, setRotateSaving] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<Policy | null>(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const [ov, au] = await Promise.all([
        apiFetch("/admin/twilio/overview").then((r) => r.json()),
        apiFetch("/admin/audit?prefix=twilio_").then((r) => (r.ok ? r.json() : { items: [] })),
      ]);
      setData(ov);
      setPolicyDraft(ov.policy);
      setAudit(au.items || []);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore caricamento" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function handleRotate() {
    if (rotateDraft.trim().length < 20) {
      setMsg({ type: "err", text: "Auth token troppo corto (minimo 20 caratteri)." });
      return;
    }
    if (!confirm("Ruotare il master auth token? Le chiamate in corso verso Twilio potrebbero fallire brevemente.")) return;
    setRotateSaving(true);
    try {
      const r = await apiFetch("/admin/twilio/rotate-master", {
        method: "POST",
        body: JSON.stringify({ auth_token: rotateDraft.trim() }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRotateDraft("");
      setMsg({ type: "ok", text: "Token master ruotato e cifrato in DB." });
      await reload();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setRotateSaving(false);
    }
  }

  async function handlePolicySave() {
    if (!policyDraft) return;
    setPolicySaving(true);
    try {
      const r = await apiFetch("/admin/twilio/policy", {
        method: "PATCH",
        body: JSON.stringify(policyDraft),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg({ type: "ok", text: "Policy aggiornata." });
      await reload();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setPolicySaving(false);
    }
  }

  async function handleSuspend(sid: string) {
    if (!confirm(`Sospendere il subaccount ${sid}? Le campagne attive si fermeranno.`)) return;
    try {
      const r = await apiFetch(`/admin/twilio/subaccount/${sid}/suspend`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg({ type: "ok", text: `Subaccount ${sid} sospeso.` });
      await reload();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore" });
    }
  }

  if (loading) return <div className="animate-pulse text-[12.5px] text-slate-500">Caricamento…</div>;
  if (!data || !policyDraft) return <div className="text-[12.5px] text-rose-300">Errore caricamento dati Twilio.</div>;

  const visibleSubs = data.subaccounts.filter((s) =>
    !filter || s.email.toLowerCase().includes(filter.toLowerCase()) || s.subaccount_sid.includes(filter)
  );

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`rounded-sm border px-3 py-2 text-[12px] ${
          msg.type === "ok"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-rose-500/30 bg-rose-500/10 text-rose-300"
        }`}>{msg.text}</div>
      )}

      {/* Sezione 1: Master config */}
      <section className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-100">Configurazione master Twilio</h2>
          <span className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${
            data.connection_ok ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${data.connection_ok ? "bg-emerald-400" : "bg-rose-400"}`} />
            {data.connection_ok ? "Connessione OK" : "Connessione KO"}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
          <div>
            <dt className="text-slate-500">Account SID</dt>
            <dd className="font-mono text-slate-100">{data.master.account_sid || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Auth token ({data.master.auth_token_source})</dt>
            <dd className="font-mono text-slate-100">{data.master.auth_token_masked || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Messaging Service SID</dt>
            <dd className="font-mono text-slate-100">{data.master.messaging_service_sid || "—"}</dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-slate-800 pt-4">
          <label className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wider text-slate-400">
            Ruota auth token master
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={rotateDraft}
              onChange={(e) => setRotateDraft(e.target.value)}
              placeholder="Incolla il nuovo auth token"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 font-mono text-[12.5px] text-slate-100"
            />
            <button
              type="button"
              onClick={handleRotate}
              disabled={rotateSaving || !rotateDraft.trim()}
              className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {rotateSaving ? "Rotazione…" : "Ruota"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Il token viene cifrato AES-GCM prima del salvataggio in <code>system_config</code>. Non è mai restituito in chiaro dall'API.
          </p>
        </div>
      </section>

      {/* Sezione 2: Provisioning policy */}
      <section className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <h2 className="mb-3 text-[15px] font-semibold text-slate-100">Policy di provisioning</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-[12.5px] text-slate-200">
            <input
              type="checkbox"
              checked={policyDraft.auto_create_subaccount_on_signup}
              onChange={(e) => setPolicyDraft({ ...policyDraft, auto_create_subaccount_on_signup: e.target.checked })}
              className="h-3.5 w-3.5"
            />
            Crea subaccount Twilio automaticamente al signup
          </label>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Regione numero default</label>
            <input
              type="text"
              value={policyDraft.default_region}
              onChange={(e) => setPolicyDraft({ ...policyDraft, default_region: e.target.value.toUpperCase() })}
              className="w-32 rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1.5 font-mono text-[12.5px] text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Pool numeri (uno per riga)</label>
            <textarea
              value={policyDraft.number_pool.join("\n")}
              onChange={(e) => setPolicyDraft({
                ...policyDraft,
                number_pool: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
              })}
              rows={3}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1.5 font-mono text-[12.5px] text-slate-100"
              placeholder="+3902..."
            />
          </div>
          <button
            type="button"
            onClick={handlePolicySave}
            disabled={policySaving}
            className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
          >
            {policySaving ? "Salvataggio…" : "Salva policy"}
          </button>
        </div>
      </section>

      {/* Sezione 3: Subaccount overview */}
      <section className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-100">Subaccount</h2>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtra per email o SID"
            className="rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1 text-[12px] text-slate-100"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="py-1.5">Utente</th>
                <th>SID</th>
                <th className="text-right">Msg mese</th>
                <th className="text-right">Costo stimato</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleSubs.map((s) => (
                <tr key={s.subaccount_sid} className="border-b border-slate-800/50">
                  <td className="py-1.5 text-slate-200">{s.email}</td>
                  <td className="font-mono text-slate-400">{s.subaccount_sid.slice(0, 12)}…</td>
                  <td className="text-right text-slate-200">{s.messages_month}</td>
                  <td className="text-right text-slate-200">€{s.est_cost_eur.toFixed(2)}</td>
                  <td className="text-slate-400">{s.status || "—"}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => handleSuspend(s.subaccount_sid)}
                      className="text-[11px] text-rose-300 hover:text-rose-200"
                    >
                      Sospendi
                    </button>
                  </td>
                </tr>
              ))}
              {!visibleSubs.length && (
                <tr><td colSpan={6} className="py-3 text-center text-slate-500">Nessun subaccount.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sezione 4: Audit log Twilio */}
      <section className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <h2 className="mb-3 text-[15px] font-semibold text-slate-100">Audit log Twilio</h2>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="py-1.5">Data</th>
                <th>Action</th>
                <th>Target</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/50">
                  <td className="py-1.5 text-slate-400">{new Date(a.created_at).toLocaleString("it-IT")}</td>
                  <td className="font-mono text-slate-200">{a.action}</td>
                  <td className="font-mono text-slate-400">{a.target_id?.slice(0, 8) || "—"}</td>
                  <td className="text-[11px] text-slate-500">{JSON.stringify(a.metadata).slice(0, 80)}</td>
                </tr>
              ))}
              {!audit.length && (
                <tr><td colSpan={4} className="py-3 text-center text-slate-500">Nessuna azione registrata.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          L'endpoint <code>GET /admin/audit?prefix=twilio_</code> è fuori scope da questo plan: se non esiste, la sezione mostrerà "Nessuna azione" senza errori (il fetch fa fallback a lista vuota su non-200).
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errori.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/_components/AdminTwilioTab.tsx
git commit -m "feat(admin): add AdminTwilioTab component with 4 sections"
```

---

## Task 10: Frontend — wire tab in page.tsx

**Files:**
- Modify: `frontend/src/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Import + VALID_TABS + render**

Edit `page.tsx`:

```typescript
import { AdminTwilioTab } from "./_components/AdminTwilioTab";

const VALID_TABS: ReadonlySet<AdminTab> = new Set<AdminTab>([
  "overview", "users", "staff", "campaigns", "whatsapp",
  "twilio",   // nuovo
  "ai_costs", "ai_revenue", "ai_key",
]);
```

E sotto l'ultimo `{tab === "ai_key" && <AISystemKeyTab />}`:

```tsx
{tab === "twilio" && <AdminTwilioTab />}
```

- [ ] **Step 2: TypeScript + smoke in browser**

```bash
cd frontend && npx tsc --noEmit && npm run dev
```

Apri `http://localhost:3000/admin?tab=twilio` come admin. Verifica: 4 sezioni renderizzate, connessione OK, policy editabile.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/page.tsx
git commit -m "feat(admin): wire AdminTwilioTab into admin page router"
```

---

## Task 11: E2E spec (Playwright, solo file — non run)

**Files:**
- Create: `frontend/e2e/admin-twilio-tab.spec.ts`

Convenzione del repo (v. `e2e/` su branch admin-roles): Playwright non è installato in CI, ma manteniamo le spec versionate per uso locale.

- [ ] **Step 1: Crea la spec**

Create `frontend/e2e/admin-twilio-tab.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

/**
 * E2E: visibilità tab Twilio per ruolo.
 * Non eseguita in CI (Playwright non installato). Utile per regression locale.
 * Richiede 3 cookie Supabase auth pre-popolate in storage state.
 */

test.describe("AdminTwilioTab — role visibility", () => {
  test("admin sees Twilio tab in sidebar", async ({ page }) => {
    await page.goto("/admin?tab=overview");
    await expect(page.getByRole("link", { name: /Twilio/ })).toBeVisible();
  });

  test("collaborator cannot access /admin?tab=twilio", async ({ page }) => {
    await page.goto("/admin?tab=twilio");
    // tab non consentito → fallback a overview (o banner 403)
    await expect(page.getByText(/Pannello Admin/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Twilio/ })).toHaveCount(0);
  });

  test("admin can open master config and see masked token", async ({ page }) => {
    await page.goto("/admin?tab=twilio");
    await expect(page.getByText(/Configurazione master Twilio/i)).toBeVisible();
    // il token è mascherato (contiene bullet) o vuoto
    const tokenCell = page.locator("dd").filter({ hasText: /•|—/ }).first();
    await expect(tokenCell).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/e2e/admin-twilio-tab.spec.ts
git commit -m "test(e2e): admin Twilio tab visibility spec (Playwright, not run in CI)"
```

---

## Task 12: Full-suite integration check

- [ ] **Step 1: Backend pytest**

```bash
cd backend && python -m pytest -q
```

Expected: tutti i test verdi; i test admin_twilio_* skippano senza JWT in CI, passano in locale con env completo.

- [ ] **Step 2: Frontend tsc**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errori.

- [ ] **Step 3: Frontend vitest (se presente suite)**

```bash
cd frontend && npx vitest run
```

Expected: nessuna regressione.

- [ ] **Step 4: Smoke manuale**

1. Login come admin → sidebar mostra voce "Twilio".
2. Click → 4 sezioni caricano. `connection_ok=true` se ENV Twilio corrette.
3. Aggiorna policy → riga `twilio_policy_updated` appare nell'audit log.
4. Login come `collaborator` → sidebar NON mostra "Twilio".
5. Prova accesso diretto `/admin?tab=twilio` da collaborator → redirect a overview o banner 403.

- [ ] **Step 5: Push e draft PR**

```bash
git push -u origin feature/plan-tiers-positioning
gh pr create --draft --title "feat(admin): Twilio management tab (sub-C)" --body "$(cat <<'EOF'
## Summary
Sub-project C di `docs/superpowers/specs/2026-04-24-plan-tiers-and-positioning-design.md`.

- Migration 027: `system_config` keys `twilio_master_*` + `twilio_provisioning_policy`; permission `admin.twilio.manage` seedata.
- Backend: 4 endpoint dietro `require_permission("admin.twilio.manage")` — overview, policy patch, rotate-master, subaccount suspend.
- Frontend: `AdminTwilioTab` con 4 sezioni (master config, policy, subaccount overview, audit log).
- `AdminSidebar` aggiornato con nuova voce + `TAB_PERMISSIONS` entry.
- Audit log per ogni mutazione (action `twilio_*`).

## Test plan
- [ ] Backend pytest green (permission + 4 endpoint)
- [ ] TSC check green
- [ ] Manual: admin vede tab + 4 sezioni; collaborator NO.
- [ ] Manual: rotate token persiste in DB (source: db nell'overview).

## Dependencies
- HARD: sub-project A (`026_plan_restructure.sql`) mergiato → overage_rates usato nel costo stimato.
- HARD: `feature/admin-roles-permissions` mergiato → `require_permission`, `role_permissions`, `audit_log`, `TAB_PERMISSIONS`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary — Sub-project C Deliverables

**New files (10):**
- `supabase/migrations/027_admin_twilio_config.sql`
- `backend/src/services/twilio_admin.py`
- `backend/src/api/admin_twilio.py`
- `backend/tests/test_admin_twilio_permission.py`
- `backend/tests/test_admin_twilio_overview.py`
- `backend/tests/test_admin_twilio_policy.py`
- `backend/tests/test_admin_twilio_rotate.py`
- `backend/tests/test_admin_twilio_suspend.py`
- `frontend/src/app/(admin)/admin/_components/AdminTwilioTab.tsx`
- `frontend/e2e/admin-twilio-tab.spec.ts`

**Modified files (3):**
- `backend/src/api/router.py` — include `admin_twilio.router`
- `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx` — nuova voce + `TAB_PERMISSIONS`
- `frontend/src/app/(admin)/admin/page.tsx` — `VALID_TABS` + render `<AdminTwilioTab />`

**Stima effort:** 3-4 giorni (1 dev full-time).

**Hard dependencies:** sub-A (026) + `feature/admin-roles-permissions`.

**Rischi:**
1. Endpoint `GET /admin/audit?prefix=twilio_` **non esistente** al momento — il tab mostra sezione audit vuota (fallback gracious). Se serve davvero, aprire follow-up plan.
2. `resolve_master_credentials` fa fallback ENV; dopo la prima rotazione in DB, la modifica di ENV non ha più effetto → documentare in runbook.
3. `suspend_subaccount` è un kill-switch reale: errato uso può fermare le campagne di un cliente. Pulsante protetto da `confirm()` client-side, ma la sicurezza vera è il permission gate.
4. Test permission richiede 3 JWT distinti (admin/collab/sales) → in CI skippati; far girare in locale prima del merge.
