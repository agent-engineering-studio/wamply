# Plan Tiers — Sub-project A: Listino Restructure and Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ristrutturare il listino Wamply da 3 piani a 5 piani (Avvio/Essenziale/Plus/Premium/Enterprise) con canone + quota Twilio inclusa + overage metered, feature AI gate per piano, e migrare le subscription esistenti senza churn.

**Architecture:** DB migration Supabase aggiunge piano Avvio e colonne `ai_features jsonb` / `msg_included int` / `overage_rates jsonb` / `active_segments text[]`. Backend FastAPI con asyncpg aggiunge enforcement quota + calcolo overage + endpoint cost-preview. Frontend Next.js 15 App Router serve `/piani` pubblica + plan picker signup + pannello admin aggiornato. Script Python migra le subscription esistenti mappando 1:1 sui prezzi attuali. Email transazionale annuncia il nuovo listino ai paganti.

**Tech Stack:** PostgreSQL (Supabase), FastAPI + asyncpg, Next.js 15 + TypeScript strict, Tailwind, Stripe (già presente), pytest + vitest.

**Reference Spec:** `docs/superpowers/specs/2026-04-24-plan-tiers-and-positioning-design.md` §5 (listino), §12.1 (sub-project A).

---

## File Structure

**Create:**
- `supabase/migrations/026_plan_restructure.sql`
- `backend/src/services/quota_enforcement.py`
- `backend/src/services/plan_migration_emails.py`
- `backend/templates/emails/plan-migrated.html`
- `backend/scripts/migrate_subscriptions.py`
- `backend/tests/test_plan_restructure.py`
- `backend/tests/test_quota_enforcement.py`
- `backend/tests/test_cost_preview.py`
- `frontend/src/app/piani/page.tsx`
- `frontend/src/app/piani/PlanCard.tsx`
- `frontend/src/app/piani/OverageCalculator.tsx`
- `frontend/src/lib/plans.ts`
- `frontend/tests/pages/piani.test.tsx`

**Modify:**
- `backend/src/api/admin.py` — update `VALID_PLAN_SLUGS`, add AI features / quota fields to admin plan endpoints
- `backend/src/api/campaigns.py` — add `GET /campaigns/:id/cost-preview`
- `backend/src/services/ai_credits.py` — gate AI features by plan (read `ai_features` from plan)
- `frontend/src/app/(admin)/admin/_components/AdminPlanManagementTab.tsx` — reflect new schema + new piano Avvio
- `frontend/src/app/(app)/signup/page.tsx` — default piano Avvio con upsell (verifica path esatto in Task 7)

---

## Task 1: DB migration — add Avvio, new columns, update seed

**Files:**
- Create: `supabase/migrations/026_plan_restructure.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 026_plan_restructure.sql
-- Restructure plans table for β+ v2 listino:
--   - Add piano "Avvio" as entry-level
--   - Add ai_features, msg_included, overage_rates, active_segments
--   - Keep existing prices (migration maps starter→essenziale, professional→plus, enterprise→premium)

BEGIN;

-- 1. Add new columns to plans
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS ai_features  jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS msg_included int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_rates jsonb  NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active_segments text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN plans.ai_features IS
  'Feature flags AI abilitate per il piano. Chiavi note: compliance_check, generate, improve, translate, analytics_standard, analytics_advanced, byok_claude_enterprise.';
COMMENT ON COLUMN plans.msg_included IS
  'Messaggi WhatsApp inclusi nel canone mensile. Overage addebitato su consumo.';
COMMENT ON COLUMN plans.overage_rates IS
  'Tariffe overage in EUR/messaggio. Chiavi: marketing, utility, free_form.';
COMMENT ON COLUMN plans.active_segments IS
  'Segmenti SME target (per suggerire il piano nelle landing /soluzioni/[segmento]).';

-- 2. Insert "Avvio" plan (if not already present)
INSERT INTO plans (
  slug, name, price_cents,
  max_campaigns_month, max_contacts, max_messages_month, max_templates, max_team_members,
  ai_credits_month, features,
  ai_features, msg_included, overage_rates, active_segments,
  active
)
VALUES (
  'avvio', 'Avvio', 1900,
  1, 500, 200, 3, 1,
  0,
  '{"byok_llm": false, "trial_days": 14}'::jsonb,
  '{"compliance_check": true}'::jsonb,
  0,
  '{"marketing": 0.09, "utility": 0.05, "free_form": 0.01}'::jsonb,
  ARRAY['parrucchieri','ristoranti','palestre','studi_medici','avvocati','immobiliari','autofficine','retail','scuole','hotel','autosaloni'],
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Update existing plans with new fields (NO price change, NO rename of slug — migration preserves backward compat)
UPDATE plans
SET
  msg_included = 300,
  overage_rates = '{"marketing": 0.09, "utility": 0.05, "free_form": 0.01}'::jsonb,
  ai_features = '{"compliance_check": true, "generate": true, "improve": true}'::jsonb,
  active_segments = ARRAY['parrucchieri','ristoranti','palestre','studi_medici','avvocati','immobiliari','autofficine','retail','scuole','hotel','autosaloni']
WHERE slug = 'starter';

UPDATE plans
SET
  msg_included = 1500,
  overage_rates = '{"marketing": 0.08, "utility": 0.045, "free_form": 0.01}'::jsonb,
  ai_features = '{"compliance_check": true, "generate": true, "improve": true, "translate": true, "analytics_standard": true}'::jsonb,
  active_segments = ARRAY['parrucchieri','ristoranti','palestre','studi_medici','avvocati','immobiliari','autofficine','retail','scuole','hotel','autosaloni']
WHERE slug = 'professional';

UPDATE plans
SET
  msg_included = 5000,
  overage_rates = '{"marketing": 0.07, "utility": 0.04, "free_form": 0.01}'::jsonb,
  ai_features = '{"compliance_check": true, "generate": true, "improve": true, "translate": true, "analytics_standard": true, "analytics_advanced": true}'::jsonb,
  active_segments = ARRAY['parrucchieri','ristoranti','palestre','studi_medici','avvocati','immobiliari','autofficine','retail','scuole','hotel','autosaloni']
WHERE slug = 'enterprise';

-- 4. Create display_name mapping for the new UI labels (keep slug stable for backward compat)
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS display_name text;

UPDATE plans SET display_name = 'Avvio' WHERE slug = 'avvio';
UPDATE plans SET display_name = 'Essenziale' WHERE slug = 'starter';
UPDATE plans SET display_name = 'Plus' WHERE slug = 'professional';
UPDATE plans SET display_name = 'Premium' WHERE slug = 'enterprise';

-- 5. Index on active_segments for landing page filtering
CREATE INDEX IF NOT EXISTS idx_plans_active_segments ON plans USING gin (active_segments);

COMMIT;
```

- [ ] **Step 2: Apply the migration**

```bash
MSYS_NO_PATHCONV=1 docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres < supabase/migrations/026_plan_restructure.sql
```

Expected: no errors, `COMMIT` at the end of output.

- [ ] **Step 3: Verify schema and seed**

```bash
MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres -c "
    SELECT slug, display_name, price_cents, msg_included,
           ai_features, overage_rates
    FROM plans
    WHERE active = true
    ORDER BY price_cents ASC;
  "
```

Expected: 4 rows (avvio 1900, starter 4900, professional 14900, enterprise 39900), each with non-empty `display_name`, `ai_features`, `overage_rates`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/026_plan_restructure.sql
git commit -m "feat(db): restructure plans for β+ v2 listino (5 tiers + quote + overage)"
```

---

## Task 2: Backend — quota enforcement service (TDD)

**Files:**
- Create: `backend/src/services/quota_enforcement.py`
- Create: `backend/tests/test_quota_enforcement.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_quota_enforcement.py`:

```python
import pytest
from unittest.mock import AsyncMock
from src.services.quota_enforcement import (
    check_message_quota,
    compute_cost_breakdown,
    QuotaExceeded,
)


@pytest.mark.asyncio
async def test_under_quota_no_overage():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "msg_included": 1000,
        "overage_rates": {"marketing": 0.08, "utility": 0.045, "free_form": 0.01},
    })
    db.fetchval = AsyncMock(return_value=500)  # already used
    result = await check_message_quota(
        db, user_id="u1", msg_count=200, category="marketing"
    )
    assert result["overage_count"] == 0
    assert result["overage_cost_eur"] == 0.0


@pytest.mark.asyncio
async def test_partial_overage_marketing():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "msg_included": 1000,
        "overage_rates": {"marketing": 0.08, "utility": 0.045, "free_form": 0.01},
    })
    db.fetchval = AsyncMock(return_value=900)  # used
    result = await check_message_quota(
        db, user_id="u1", msg_count=200, category="marketing"
    )
    assert result["overage_count"] == 100
    assert result["overage_cost_eur"] == pytest.approx(8.0, rel=0.001)


@pytest.mark.asyncio
async def test_compute_breakdown_mixed_categories():
    rates = {"marketing": 0.08, "utility": 0.045, "free_form": 0.01}
    breakdown = compute_cost_breakdown(
        counts={"marketing": 100, "utility": 50, "free_form": 30},
        rates=rates,
    )
    expected = 100 * 0.08 + 50 * 0.045 + 30 * 0.01
    assert breakdown["total_eur"] == pytest.approx(expected, rel=0.001)
    assert breakdown["by_category"]["marketing"] == pytest.approx(8.0, rel=0.001)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_quota_enforcement.py -v
```

Expected: ImportError or ModuleNotFoundError on `quota_enforcement`.

- [ ] **Step 3: Implement the service**

Create `backend/src/services/quota_enforcement.py`:

```python
"""Message quota enforcement + overage cost computation.

Used by campaign dispatch and by the cost-preview endpoint to tell the user
how much a campaign will cost BEFORE they confirm send.

Rates are stored per-plan in plans.overage_rates (EUR/message) and read at
runtime — a migration or admin edit automatically propagates.
"""

from typing import Literal

import asyncpg
import structlog

logger = structlog.get_logger()

MessageCategory = Literal["marketing", "utility", "free_form"]


class QuotaExceeded(Exception):
    """Raised when a send would exceed hard quota (reserved for future use).
    Today we always allow overage and charge it; this exception is here so
    Enterprise or trial plans can enable hard-stop behavior later."""


async def _get_user_plan(db: asyncpg.Pool, user_id: str) -> dict:
    """Fetch the user's active plan quota fields."""
    row = await db.fetchrow(
        """SELECT p.msg_included, p.overage_rates
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.user_id = $1 AND s.status = 'active'
           LIMIT 1""",
        user_id,
    )
    if not row:
        # No active subscription — treat as zero-quota free account (user on trial or cancelled)
        return {"msg_included": 0, "overage_rates": {"marketing": 0.09, "utility": 0.05, "free_form": 0.01}}
    return {"msg_included": row["msg_included"], "overage_rates": dict(row["overage_rates"])}


async def _get_month_usage(db: asyncpg.Pool, user_id: str) -> int:
    """Total messages consumed in current month (any category)."""
    val = await db.fetchval(
        """SELECT COALESCE(messages_used, 0)
           FROM usage_counters
           WHERE user_id = $1
             AND period_start = date_trunc('month', now())::date""",
        user_id,
    )
    return int(val or 0)


def compute_cost_breakdown(counts: dict[str, int], rates: dict[str, float]) -> dict:
    """Pure function: given msg counts per category + rates, compute totals.
    Isolated for easy unit testing without a DB mock."""
    by_category = {}
    total = 0.0
    for cat, n in counts.items():
        r = float(rates.get(cat, 0.0))
        cost = n * r
        by_category[cat] = round(cost, 4)
        total += cost
    return {"by_category": by_category, "total_eur": round(total, 4)}


async def check_message_quota(
    db: asyncpg.Pool,
    user_id: str,
    msg_count: int,
    category: MessageCategory,
) -> dict:
    """Given a prospective send of N messages in a category, return
    how many are within the included quota, how many overflow, and the
    overage cost in EUR."""
    plan = await _get_user_plan(db, user_id)
    used = await _get_month_usage(db, user_id)
    remaining = max(0, plan["msg_included"] - used)

    within_quota = min(msg_count, remaining)
    overage_count = msg_count - within_quota

    overage_cost = 0.0
    if overage_count > 0:
        rate = float(plan["overage_rates"].get(category, 0.0))
        overage_cost = round(overage_count * rate, 4)

    return {
        "msg_count": msg_count,
        "within_quota": within_quota,
        "overage_count": overage_count,
        "overage_category": category,
        "overage_cost_eur": overage_cost,
        "quota_remaining_before_send": remaining,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_quota_enforcement.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/quota_enforcement.py backend/tests/test_quota_enforcement.py
git commit -m "feat(backend): add quota enforcement + overage cost breakdown"
```

---

## Task 3: Backend — cost preview endpoint (TDD)

**Files:**
- Modify: `backend/src/api/campaigns.py`
- Create: `backend/tests/test_cost_preview.py`

- [ ] **Step 1: Inspect current campaigns.py to find the right insertion point**

```bash
grep -n "^@router\|^def\|^async def" backend/src/api/campaigns.py | head -20
```

Note: the cost preview endpoint goes *next to* the existing campaign GET endpoints (near `/campaigns/:id`). Use that file structure.

- [ ] **Step 2: Write failing test**

Create `backend/tests/test_cost_preview.py`:

```python
"""Cost preview endpoint test. Integration-style — skips without DB.
Uses FastAPI TestClient pattern consistent with test_admin_role_change.py."""
import os
import pytest
import httpx

BASE = os.getenv("API_BASE", "http://localhost:8000")
ADMIN_JWT = os.getenv("ADMIN_JWT")
CAMPAIGN_ID = os.getenv("TEST_CAMPAIGN_ID")


@pytest.mark.skipif(not (ADMIN_JWT and CAMPAIGN_ID), reason="Requires ADMIN_JWT + TEST_CAMPAIGN_ID")
def test_cost_preview_returns_breakdown():
    r = httpx.get(
        f"{BASE}/campaigns/{CAMPAIGN_ID}/cost-preview",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "msg_count" in body
    assert "overage_count" in body
    assert "overage_cost_eur" in body
    assert "quota_remaining_before_send" in body
    assert body["overage_category"] in ("marketing", "utility", "free_form")


@pytest.mark.skipif(not ADMIN_JWT, reason="Requires ADMIN_JWT")
def test_cost_preview_404_on_unknown_campaign():
    r = httpx.get(
        f"{BASE}/campaigns/00000000-0000-0000-0000-000000000000/cost-preview",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
    )
    assert r.status_code == 404
```

- [ ] **Step 3: Run the test to verify it skips or fails**

```bash
cd backend && python -m pytest tests/test_cost_preview.py -v
```

Expected: skipped (no ADMIN_JWT in CI) OR fails with 404 on the endpoint (not yet implemented).

- [ ] **Step 4: Add the endpoint to campaigns.py**

Add in `backend/src/api/campaigns.py`:

```python
from src.services.quota_enforcement import check_message_quota


@router.get("/{campaign_id}/cost-preview")
async def campaign_cost_preview(
    request: Request,
    campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Return the estimated cost of sending this campaign right now.
    Considers current month usage, plan quota, overage rates, and the
    campaign's target recipient count.

    The `category` is inferred from the campaign's template category
    (marketing/utility/free_form). Unclassified templates default to
    marketing (worst case, safer for user expectation)."""
    db = get_db(request)

    row = await db.fetchrow(
        """SELECT c.user_id, c.contact_count, t.category
           FROM campaigns c
           LEFT JOIN templates t ON t.id = c.template_id
           WHERE c.id = $1""",
        campaign_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    if str(row["user_id"]) != str(user.id) and user.role != "admin":
        raise HTTPException(status_code=403, detail="Non autorizzato.")

    msg_count = int(row["contact_count"] or 0)
    category = (row["category"] or "marketing").lower()
    if category not in ("marketing", "utility", "free_form"):
        category = "marketing"

    preview = await check_message_quota(
        db, user_id=str(row["user_id"]), msg_count=msg_count, category=category
    )
    return preview
```

- [ ] **Step 5: Restart backend and re-run tests**

```bash
docker compose restart backend
sleep 3
cd backend && python -m pytest tests/test_cost_preview.py -v
```

Expected: skipped (no env) or pass if env vars set locally.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/campaigns.py backend/tests/test_cost_preview.py
git commit -m "feat(backend): add GET /campaigns/:id/cost-preview endpoint"
```

---

## Task 4: Backend — feature gating AI per piano

**Files:**
- Modify: `backend/src/services/ai_credits.py` (or appropriate AI routing module)
- Create: `backend/tests/test_ai_feature_gating.py`

- [ ] **Step 1: Locate the current AI entry point**

```bash
grep -n "generate\|improve\|translate\|compliance_check" backend/src/services/ai_credits.py backend/src/api/*.py | head
```

The gating hook goes before the Claude API call — check `ai_features` from plan and 403 if the user doesn't have the feature.

- [ ] **Step 2: Write failing test**

Create `backend/tests/test_ai_feature_gating.py`:

```python
import pytest
from unittest.mock import AsyncMock
from src.services.quota_enforcement import _get_user_plan  # reuse plan loader
from src.services.ai_feature_gating import require_ai_feature, AIFeatureForbidden


@pytest.mark.asyncio
async def test_allows_when_plan_has_feature():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "ai_features": {"compliance_check": True, "generate": True}
    })
    await require_ai_feature(db, "u1", "generate")  # must not raise


@pytest.mark.asyncio
async def test_forbids_when_plan_lacks_feature():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={"ai_features": {"compliance_check": True}})
    with pytest.raises(AIFeatureForbidden):
        await require_ai_feature(db, "u1", "generate")


@pytest.mark.asyncio
async def test_forbids_when_no_subscription():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value=None)
    with pytest.raises(AIFeatureForbidden):
        await require_ai_feature(db, "u1", "generate")
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_ai_feature_gating.py -v
```

Expected: ImportError on `ai_feature_gating`.

- [ ] **Step 4: Implement the module**

Create `backend/src/services/ai_feature_gating.py`:

```python
"""AI feature gating per plan.

Reads plans.ai_features (jsonb) for the user's active subscription and
raises AIFeatureForbidden if the requested feature is not enabled for
their plan. Called from each AI endpoint (generate, improve, translate,
analytics_advanced) before charging credits or calling Claude.
"""

from fastapi import HTTPException

import asyncpg


class AIFeatureForbidden(HTTPException):
    def __init__(self, feature: str):
        super().__init__(
            status_code=403,
            detail=f"La funzione '{feature}' non è disponibile nel tuo piano attuale.",
        )


async def require_ai_feature(db: asyncpg.Pool, user_id: str, feature: str) -> None:
    row = await db.fetchrow(
        """SELECT p.ai_features
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.user_id = $1 AND s.status = 'active'
           LIMIT 1""",
        user_id,
    )
    if not row or not dict(row["ai_features"]).get(feature, False):
        raise AIFeatureForbidden(feature)
```

- [ ] **Step 5: Wire the gate into each AI endpoint**

Locate each AI endpoint in `backend/src/api/` (grep for `ai_credits.resolve_api_key` or `anthropic`) and insert:

```python
from src.services.ai_feature_gating import require_ai_feature
# ...
await require_ai_feature(db, str(user.id), "generate")  # or "improve", "translate", etc.
```

Mapping endpoint → feature:
- `/templates/generate` → `generate`
- `/templates/improve` → `improve`
- `/templates/translate` → `translate`
- `/templates/compliance-check` → `compliance_check`
- `/admin/ai/analytics/advanced` → `analytics_advanced` (new endpoint, if implemented here)

- [ ] **Step 6: Run tests and restart**

```bash
cd backend && python -m pytest tests/test_ai_feature_gating.py -v
docker compose restart backend
```

Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/ai_feature_gating.py backend/tests/test_ai_feature_gating.py \
        backend/src/api/templates.py
git commit -m "feat(backend): gate AI features by plan via require_ai_feature"
```

---

## Task 5: Frontend — pricing page `/piani`

**Files:**
- Create: `frontend/src/app/piani/page.tsx`
- Create: `frontend/src/app/piani/PlanCard.tsx`
- Create: `frontend/src/app/piani/OverageCalculator.tsx`
- Create: `frontend/src/lib/plans.ts`

- [ ] **Step 1: Create the plan data file**

Create `frontend/src/lib/plans.ts`:

```typescript
export interface PlanTier {
  slug: string;
  displayName: string;
  priceEur: number;
  msgIncluded: number;
  overageRates: { marketing: number; utility: number; free_form: number };
  aiFeatures: {
    compliance_check: boolean;
    generate: boolean;
    improve: boolean;
    translate: boolean;
    analytics_standard: boolean;
    analytics_advanced: boolean;
  };
  onboarding: boolean;
  target: string;
  highlighted?: boolean;
}

export const PLANS: PlanTier[] = [
  {
    slug: "avvio",
    displayName: "Avvio",
    priceEur: 19,
    msgIncluded: 0,
    overageRates: { marketing: 0.09, utility: 0.05, free_form: 0.01 },
    aiFeatures: {
      compliance_check: true,
      generate: false,
      improve: false,
      translate: false,
      analytics_standard: false,
      analytics_advanced: false,
    },
    onboarding: false,
    target: "Micro-impresa o professionista singolo",
  },
  {
    slug: "starter",  // maps to "Essenziale" via display_name
    displayName: "Essenziale",
    priceEur: 49,
    msgIncluded: 300,
    overageRates: { marketing: 0.09, utility: 0.05, free_form: 0.01 },
    aiFeatures: {
      compliance_check: true,
      generate: true,
      improve: true,
      translate: false,
      analytics_standard: false,
      analytics_advanced: false,
    },
    onboarding: false,
    target: "Piccola attività con team fino a 5",
    highlighted: true,
  },
  {
    slug: "professional",  // → "Plus"
    displayName: "Plus",
    priceEur: 149,
    msgIncluded: 1500,
    overageRates: { marketing: 0.08, utility: 0.045, free_form: 0.01 },
    aiFeatures: {
      compliance_check: true,
      generate: true,
      improve: true,
      translate: true,
      analytics_standard: true,
      analytics_advanced: false,
    },
    onboarding: false,
    target: "Attività strutturata o multi-sede",
  },
  {
    slug: "enterprise",  // → "Premium"
    displayName: "Premium",
    priceEur: 399,
    msgIncluded: 5000,
    overageRates: { marketing: 0.07, utility: 0.04, free_form: 0.01 },
    aiFeatures: {
      compliance_check: true,
      generate: true,
      improve: true,
      translate: true,
      analytics_standard: true,
      analytics_advanced: true,
    },
    onboarding: true,
    target: "Grande attività o catena",
  },
];

export const FEATURE_LABELS: Record<keyof PlanTier["aiFeatures"], string> = {
  compliance_check: "Controllo conformità WhatsApp",
  generate: "Generazione template AI",
  improve: "Riscrittura messaggi AI",
  translate: "Traduzione multi-lingua",
  analytics_standard: "Analytics base (open, click)",
  analytics_advanced: "Analytics avanzati (cohort, predizione)",
};
```

- [ ] **Step 2: Create the PlanCard component**

Create `frontend/src/app/piani/PlanCard.tsx`:

```tsx
import Link from "next/link";
import type { PlanTier } from "@/lib/plans";
import { FEATURE_LABELS } from "@/lib/plans";

export function PlanCard({ plan }: { plan: PlanTier }) {
  const isHighlight = plan.highlighted;
  return (
    <div
      className={`relative flex flex-col rounded-card border p-6 shadow-card ${
        isHighlight
          ? "border-brand-teal bg-brand-navy-light ring-2 ring-brand-teal/40"
          : "border-slate-800 bg-brand-navy-light"
      }`}
    >
      {isHighlight && (
        <span className="absolute -top-3 left-6 rounded-pill bg-brand-teal px-3 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-white">
          Consigliato
        </span>
      )}
      <h3 className="text-[16px] font-semibold text-slate-100">{plan.displayName}</h3>
      <p className="mt-1 text-[12px] text-slate-400">{plan.target}</p>
      <div className="mt-4">
        <span className="text-[32px] font-bold text-slate-100">€{plan.priceEur}</span>
        <span className="text-[12px] text-slate-400">/mese</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">
        {plan.msgIncluded > 0
          ? `${plan.msgIncluded} messaggi inclusi`
          : "Solo consumo a messaggio"}
      </div>
      <ul className="mt-5 flex-1 space-y-2 text-[12px] text-slate-300">
        {Object.entries(plan.aiFeatures).map(([key, enabled]) => (
          <li key={key} className={enabled ? "text-slate-200" : "text-slate-600 line-through"}>
            {enabled ? "✓" : "·"}{" "}
            {FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]}
          </li>
        ))}
        {plan.onboarding && (
          <li className="text-slate-200">✓ Onboarding 1:1 in italiano</li>
        )}
      </ul>
      <div className="mt-5 text-[10.5px] text-slate-500">
        Overage: €{plan.overageRates.marketing}/msg marketing · €
        {plan.overageRates.utility}/msg utility
      </div>
      <Link
        href={`/prova?plan=${plan.slug}`}
        className={`mt-5 block rounded-sm px-4 py-2.5 text-center text-[13px] font-medium transition-colors ${
          isHighlight
            ? "bg-brand-teal text-white hover:bg-brand-teal-dark"
            : "border border-slate-700 text-slate-100 hover:bg-brand-navy-deep"
        }`}
      >
        Prova 14 giorni
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Create the OverageCalculator component**

Create `frontend/src/app/piani/OverageCalculator.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { PLANS } from "@/lib/plans";

export function OverageCalculator() {
  const [planSlug, setPlanSlug] = useState("starter");
  const [msgCount, setMsgCount] = useState(500);
  const [category, setCategory] = useState<"marketing" | "utility" | "free_form">(
    "marketing",
  );

  const plan = PLANS.find((p) => p.slug === planSlug)!;
  const { overageCount, overageCost, total } = useMemo(() => {
    const overage = Math.max(0, msgCount - plan.msgIncluded);
    const rate = plan.overageRates[category];
    const cost = Math.round(overage * rate * 100) / 100;
    return {
      overageCount: overage,
      overageCost: cost,
      total: plan.priceEur + cost,
    };
  }, [plan, msgCount, category]);

  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-6">
      <h3 className="mb-4 text-[14px] font-semibold text-slate-100">
        Calcolatore costo mensile
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[11px] text-slate-400">Piano</span>
          <select
            value={planSlug}
            onChange={(e) => setPlanSlug(e.target.value)}
            className="mt-1 w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-2 py-1.5 text-[13px] text-slate-100"
          >
            {PLANS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.displayName} (€{p.priceEur})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-400">Messaggi/mese stimati</span>
          <input
            type="number"
            min={0}
            value={msgCount}
            onChange={(e) => setMsgCount(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-2 py-1.5 text-[13px] text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-400">Tipo prevalente</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as "marketing" | "utility" | "free_form")
            }
            className="mt-1 w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-2 py-1.5 text-[13px] text-slate-100"
          >
            <option value="marketing">Marketing (promozioni)</option>
            <option value="utility">Utility (promemoria)</option>
            <option value="free_form">Risposta entro 24h</option>
          </select>
        </label>
      </div>
      <div className="mt-4 rounded-sm border border-brand-teal/30 bg-brand-teal/5 p-3 text-[12.5px] text-slate-200">
        <div>
          Canone: <strong>€{plan.priceEur}</strong> · Inclusi:{" "}
          <strong>{plan.msgIncluded}</strong> msg
        </div>
        <div>
          Overage: <strong>{overageCount}</strong> msg × €
          {plan.overageRates[category]} = <strong>€{overageCost}</strong>
        </div>
        <div className="mt-2 text-[14px] font-semibold text-brand-teal">
          Totale stimato: €{total.toFixed(2)}/mese
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the pricing page**

Create `frontend/src/app/piani/page.tsx`:

```tsx
import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { PlanCard } from "./PlanCard";
import { OverageCalculator } from "./OverageCalculator";

export const metadata = {
  title: "Piani e prezzi | Wamply",
  description:
    "Scegli il piano giusto per la tua attività. 5 opzioni da €19/mese, messaggi WhatsApp inclusi, fattura elettronica italiana. Prova 14 giorni gratis.",
};

export default function PianiPage() {
  return (
    <div className="min-h-screen bg-brand-navy-deep py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 text-center">
          <h1 className="text-[32px] font-bold text-slate-100">
            Piani pensati per la tua attività
          </h1>
          <p className="mt-2 text-[14px] text-slate-400">
            Canone flat + consumo reale dei messaggi. Niente sorprese. Fattura
            elettronica inclusa.
          </p>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} />
          ))}
        </div>

        <div className="mb-10">
          <OverageCalculator />
        </div>

        <div className="rounded-card border border-slate-800 bg-brand-navy-light p-6 text-center">
          <h2 className="text-[16px] font-semibold text-slate-100">
            Volumi superiori?
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-400">
            Per oltre 20.000 messaggi al mese o esigenze custom, costruiamo
            insieme il piano <strong>Enterprise</strong> con SLA dedicato.
          </p>
          <Link
            href="mailto:sales@wamply.it"
            className="mt-4 inline-block rounded-sm border border-brand-teal px-5 py-2 text-[13px] font-medium text-brand-teal hover:bg-brand-teal/10"
          >
            Parla con un consulente
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify the page renders**

```bash
cd frontend && npm run dev
# browse to http://localhost:3000/piani
```

Expected: 4 plan cards render, "Essenziale" highlighted, OverageCalculator works when changing values, no console errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/piani/ frontend/src/lib/plans.ts
git commit -m "feat(frontend): add public /piani pricing page with overage calculator"
```

---

## Task 6: Frontend — pricing page test

**Files:**
- Create: `frontend/tests/pages/piani.test.tsx`

- [ ] **Step 1: Write the test**

Create `frontend/tests/pages/piani.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import PianiPage from "@/app/piani/page";

describe("/piani", () => {
  it("renders all 4 plan cards with prices", () => {
    render(<PianiPage />);
    expect(screen.getByText("Avvio")).toBeInTheDocument();
    expect(screen.getByText("Essenziale")).toBeInTheDocument();
    expect(screen.getByText("Plus")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(screen.getAllByText(/€19/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/€399/)[0]).toBeInTheDocument();
  });

  it("highlights the Essenziale plan with 'Consigliato' badge", () => {
    render(<PianiPage />);
    expect(screen.getByText("Consigliato")).toBeInTheDocument();
  });

  it("updates calculator total when msg count changes", () => {
    render(<PianiPage />);
    const input = screen.getByLabelText(/Messaggi\/mese stimati/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000" } });
    // 2000 msg on Essenziale (300 included) = 1700 overage × €0.09 = €153 + €49 = €202
    expect(screen.getByText(/Totale stimato: €202\.00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd frontend && npx vitest run tests/pages/piani.test.tsx
```

Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/pages/piani.test.tsx
git commit -m "test(frontend): cover /piani rendering and overage calculator"
```

---

## Task 7: Frontend — signup plan picker (default Avvio)

**Files:**
- Modify: whatever signup page exists (grep to find)

- [ ] **Step 1: Locate signup entry**

```bash
grep -rn "plan_slug\|priceEur\|starter" frontend/src/app/ | grep -i "sign\|register\|onboard" | head
```

- [ ] **Step 2: Update default plan selection**

In the signup form, default the `plan` query param / form state to `"avvio"`. Add an explicit "Upsell a Essenziale" banner above the submit with a skip link.

Example (adjust to actual file):

```tsx
// frontend/src/app/(auth)/signup/PlanPicker.tsx
import { PLANS } from "@/lib/plans";
import Link from "next/link";

export function PlanPicker({ selected, onSelect }: { selected: string; onSelect: (slug: string) => void }) {
  return (
    <div className="grid gap-2">
      {PLANS.map((p) => (
        <button
          key={p.slug}
          type="button"
          onClick={() => onSelect(p.slug)}
          className={`rounded-sm border p-3 text-left ${
            selected === p.slug
              ? "border-brand-teal bg-brand-teal/10"
              : "border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-slate-100">
              {p.displayName}
            </span>
            <span className="text-[12px] text-slate-400">€{p.priceEur}/mese</span>
          </div>
          <div className="text-[11px] text-slate-500">{p.target}</div>
        </button>
      ))}
      <Link href="/piani" className="text-[11px] text-brand-teal underline">
        Confronta tutti i piani
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Verify signup default in browser**

Visit `/prova` (or the signup route) without query params → `avvio` selected. With `/prova?plan=essenziale` → Essenziale selected.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/<signup-path>/PlanPicker.tsx frontend/src/app/<signup-path>/page.tsx
git commit -m "feat(frontend): signup defaults to Avvio plan with upsell to Essenziale"
```

---

## Task 8: Admin — update plan management tab

**Files:**
- Modify: `frontend/src/app/(admin)/admin/_components/AdminPlanManagementTab.tsx`

- [ ] **Step 1: Inspect current tab**

```bash
cat frontend/src/app/\(admin\)/admin/_components/AdminPlanManagementTab.tsx | head -80
```

- [ ] **Step 2: Add display_name, msg_included, overage_rates, ai_features columns**

Update the plan table/list to show the new fields. Read them from the existing `/admin/plans` endpoint — if the endpoint doesn't return them yet, update `backend/src/api/admin.py::admin_plans` to include them:

```python
# In backend/src/api/admin.py admin_plans():
rows = await db.fetch(
    "SELECT id, name, display_name, slug, price_cents, "
    "max_campaigns_month, max_contacts, max_messages_month, "
    "max_templates, max_team_members, "
    "msg_included, overage_rates, ai_features, active_segments "
    "FROM plans WHERE active = true ORDER BY price_cents ASC"
)
```

In the frontend tab, render the new fields as read-only for now (full edit UI can come in sub-project A v2 if needed). Primary goal here is visibility for admins.

- [ ] **Step 3: Verify in browser**

Login as admin → `/admin?tab=plans` → verify all 4 plans listed with correct msg_included and overage rates. "Avvio" visible.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/admin.py frontend/src/app/\(admin\)/admin/_components/AdminPlanManagementTab.tsx
git commit -m "feat(admin): show new plan fields (msg_included, overage, ai_features)"
```

---

## Task 9: Migration email template

**Files:**
- Create: `backend/templates/emails/plan-migrated.html`

- [ ] **Step 1: Create the template**

Create `backend/templates/emails/plan-migrated.html` following the existing meta-status/role-change email style (inline CSS, navy/teal palette, Italian copy):

```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>Il tuo piano Wamply è stato aggiornato</title>
</head>
<body style="margin:0;padding:0;background:#0F1B33;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1B2A4A;border-radius:12px;padding:32px;color:#E2E8F0;">
    <h1 style="color:#0D9488;font-size:22px;margin:0 0 16px;">
      Ciao {{USER_NAME}}, il tuo piano Wamply ha guadagnato funzioni gratis
    </h1>
    <p style="font-size:14px;line-height:1.6;color:#94A3B8;">
      Abbiamo rinnovato il listino per offrire più valore. Il tuo piano
      <strong style="color:#F1F5F9;">{{OLD_PLAN_NAME}}</strong> si chiama ora
      <strong style="color:#0D9488;">{{NEW_PLAN_NAME}}</strong> e include
      funzioni AI aggiuntive senza aumento di prezzo.
    </p>
    <div style="background:#0F1B33;border-radius:8px;padding:16px;margin:24px 0;">
      <div style="font-size:12px;color:#64748B;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">
        Novità incluse
      </div>
      {{NEW_FEATURES_LIST_HTML}}
    </div>
    <p style="font-size:13px;color:#94A3B8;">
      Il prezzo resta <strong>€{{PRICE_EUR}}/mese</strong>. Il canone include
      ora <strong>{{MSG_INCLUDED}} messaggi WhatsApp</strong>. Oltre la quota,
      paghi solo ciò che consumi (tariffe dettagliate nel pannello).
    </p>
    <a href="{{CTA_URL}}" style="display:inline-block;background:#0D9488;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
      Vai al tuo pannello
    </a>
    <p style="font-size:11px;color:#64748B;margin-top:32px;">
      Hai domande? Rispondi a questa email o scrivi a supporto@wamply.it.
    </p>
  </div>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add backend/templates/emails/plan-migrated.html
git commit -m "feat(emails): add plan-migrated transactional template"
```

---

## Task 10: Migration service + script

**Files:**
- Create: `backend/src/services/plan_migration_emails.py`
- Create: `backend/scripts/migrate_subscriptions.py`
- Create: `backend/tests/test_plan_migration_emails.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_plan_migration_emails.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch

from src.services.plan_migration_emails import (
    _compute_new_features,
    send_migration_notice,
)


def test_compute_new_features_starter_to_essenziale():
    old = {"compliance_check": True}
    new = {"compliance_check": True, "generate": True, "improve": True}
    added = _compute_new_features(old, new)
    assert "generate" in added
    assert "improve" in added
    assert "compliance_check" not in added


def test_compute_new_features_empty_when_no_change():
    assert _compute_new_features({"generate": True}, {"generate": True}) == set()


@pytest.mark.asyncio
async def test_send_migration_notice_returns_false_on_smtp_error():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "email": "u@test.com", "full_name": "Test",
        "old_name": "Starter", "new_name": "Essenziale",
        "old_features": {"compliance_check": True},
        "new_features": {"compliance_check": True, "generate": True, "improve": True},
        "price_cents": 4900, "msg_included": 300,
    })
    with patch("src.services.plan_migration_emails._send_email", side_effect=OSError("smtp")):
        ok = await send_migration_notice(db, "uid")
    assert ok is False
```

- [ ] **Step 2: Implement the service**

Create `backend/src/services/plan_migration_emails.py`:

```python
"""Send one-shot email to existing paying users announcing the β+ v2 listino
rename and new included features. Idempotent — safe to re-run; tracks which
user_ids have been notified via audit_log rows with action='plan_migration_notice'."""
import html
import os
import structlog
import asyncpg

from src.services.meta_status_emails import _load_template, _render, _send_email

logger = structlog.get_logger()

FEATURE_LABELS = {
    "compliance_check": "Controllo conformità WhatsApp (Meta/Twilio)",
    "generate": "Generazione template con AI in italiano colloquiale",
    "improve": "Riscrittura messaggi con AI per tono e lunghezza",
    "translate": "Traduzione multi-lingua (IT/EN/DE/FR/ES)",
    "analytics_standard": "Analytics campagne (open, click, reply)",
    "analytics_advanced": "Analytics avanzati (cohort, predizione no-show)",
}


def _compute_new_features(old: dict, new: dict) -> set[str]:
    """Return keys present-and-true in `new` but not in `old`."""
    old_enabled = {k for k, v in (old or {}).items() if v}
    new_enabled = {k for k, v in (new or {}).items() if v}
    return new_enabled - old_enabled


def _features_html(added: set[str]) -> str:
    lis = "".join(
        f'<li style="margin:4px 0;color:#94A3B8;font-size:13.5px;line-height:1.5;">{html.escape(FEATURE_LABELS[k])}</li>'
        for k in sorted(added)
        if k in FEATURE_LABELS
    )
    return f'<ul style="margin:0;padding-left:20px;">{lis}</ul>' if lis else ""


async def send_migration_notice(db: asyncpg.Pool, user_id: str) -> bool:
    row = await db.fetchrow(
        """SELECT u.email, u.full_name,
                  p.name as new_name, p.ai_features as new_features,
                  p.price_cents, p.msg_included,
                  (
                    SELECT name FROM plans WHERE slug IN ('starter','professional','enterprise')
                      AND id = s.plan_id
                  ) as old_name,
                  '{}'::jsonb as old_features
           FROM users u
           JOIN subscriptions s ON s.user_id = u.id
           JOIN plans p ON p.id = s.plan_id
           WHERE u.id = $1 AND s.status = 'active'""",
        user_id,
    )
    if not row or not row["email"]:
        return False

    added = _compute_new_features(
        dict(row["old_features"] or {}),
        dict(row["new_features"] or {}),
    )
    if not added:
        logger.info("plan_migration_no_new_features", user_id=user_id)
        return False

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    full_name = row["full_name"] or row["email"].split("@")[0]

    variables = {
        "USER_NAME": html.escape(full_name),
        "OLD_PLAN_NAME": html.escape(row["old_name"] or "il tuo piano"),
        "NEW_PLAN_NAME": html.escape(row["new_name"]),
        "NEW_FEATURES_LIST_HTML": _features_html(added),
        "PRICE_EUR": f"{row['price_cents'] / 100:.0f}",
        "MSG_INCLUDED": str(row["msg_included"]),
        "CTA_URL": f"{app_url}/admin",
    }

    tpl = _load_template("plan-migrated.html")
    if not tpl:
        logger.warning("plan_migration_template_missing")
        return False

    body = _render(tpl, variables)
    try:
        _send_email(row["email"], f"Il tuo piano Wamply ora si chiama {row['new_name']}", body)
        logger.info("plan_migration_email_sent", user_id=user_id)
        return True
    except Exception as exc:
        logger.warning("plan_migration_email_failed", error=str(exc))
        return False
```

- [ ] **Step 3: Run test**

```bash
cd backend && python -m pytest tests/test_plan_migration_emails.py -v
```

Expected: 3 passed.

- [ ] **Step 4: Create the migration script**

Create `backend/scripts/migrate_subscriptions.py`:

```python
"""One-shot migration: notify every active paying user about the new plan
naming + included features. Idempotent via audit_log.

Run with: python -m backend.scripts.migrate_subscriptions
"""
import asyncio
import asyncpg
import os
import structlog

from src.services.plan_migration_emails import send_migration_notice

logger = structlog.get_logger()


async def main():
    dsn = os.environ["DATABASE_URL"]
    pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5)
    try:
        async with pool.acquire() as conn:
            # Skip users already notified
            users = await conn.fetch("""
                SELECT u.id FROM users u
                JOIN subscriptions s ON s.user_id = u.id
                WHERE s.status = 'active'
                  AND u.id NOT IN (
                    SELECT target_id FROM audit_log
                    WHERE action = 'plan_migration_notice'
                  )
            """)
        logger.info("plan_migration_start", count=len(users))
        for u in users:
            uid = str(u["id"])
            ok = await send_migration_notice(pool, uid)
            if ok:
                async with pool.acquire() as conn:
                    await conn.execute(
                        "INSERT INTO audit_log (action, target_id) VALUES ('plan_migration_notice', $1)",
                        uid,
                    )
            logger.info("plan_migration_user", user_id=uid, sent=ok)
        logger.info("plan_migration_done")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
```

Note: this script assumes `audit_log` table exists. If the admin-roles branch (`feature/admin-roles-permissions` migration 019) hasn't been merged yet, create a minimal `audit_log` in a new migration or defer the idempotency tracking to a flag on `subscriptions`.

- [ ] **Step 5: Dry-run the script against staging**

```bash
# Against a staging DB:
DATABASE_URL=postgres://... python -m backend.scripts.migrate_subscriptions
# Verify in MailHog and audit_log table
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/plan_migration_emails.py \
        backend/scripts/migrate_subscriptions.py \
        backend/tests/test_plan_migration_emails.py
git commit -m "feat(backend): plan migration email service + one-shot batch script"
```

---

## Task 11: Full-suite integration check

- [ ] **Step 1: Run full backend suite**

```bash
cd backend && python -m pytest -q
```

Expected: all previously-passing tests still green + new tests from tasks 2/4/10 pass.

- [ ] **Step 2: Run full frontend suite**

```bash
cd frontend && npx vitest run
```

Expected: previously-passing tests green + new test from task 6 passes.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Manual smoke (logged-in as existing user)**

1. Login as an existing paying user.
2. Navigate to `/piani` → verify 4 cards, highlight on Essenziale, calculator works.
3. Go to `/admin?tab=plans` as admin → verify new fields visible.
4. Create a campaign and call the cost-preview endpoint → verify response shape.
5. Trigger one migration email in staging → verify MailHog receives it with correct merged features.

- [ ] **Step 5: Commit pending files + push branch**

```bash
git status
git push -u origin feature/plan-tiers-positioning
```

- [ ] **Step 6: Open draft PR (do NOT merge yet — sub-projects B and C need to land together for a coherent release)**

```bash
gh pr create --draft --title "feat(plans): β+ v2 listino restructure + migration (sub-A)" --body "$(cat <<'EOF'
## Summary
Sub-project A of `docs/superpowers/specs/2026-04-24-plan-tiers-and-positioning-design.md`.

- DB migration 026: adds piano Avvio, `msg_included`, `overage_rates`, `ai_features`, `active_segments`, `display_name` to `plans`
- Backend: `quota_enforcement.py` + `ai_feature_gating.py` + `GET /campaigns/:id/cost-preview`
- Frontend: public `/piani` pricing page with overage calculator
- Signup defaults to `avvio` plan with upsell
- Admin plan management tab updated for new schema
- Plan-migrated email template + one-shot batch script

## Test plan
- [ ] Backend pytest green (quota/gating/migration email tests)
- [ ] Frontend vitest green (/piani page test)
- [ ] Migration script dry-run against staging DB
- [ ] Manual: login as existing user, verify /piani renders + cost preview works

## Dependencies
- None for B/C to start (they layer on top of this migration)
- Admin Twilio tab (sub-C) needs this branch merged first

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary — Sub-project A Deliverables

**New files (14):**
- `supabase/migrations/026_plan_restructure.sql`
- `backend/src/services/quota_enforcement.py`
- `backend/src/services/ai_feature_gating.py`
- `backend/src/services/plan_migration_emails.py`
- `backend/scripts/migrate_subscriptions.py`
- `backend/templates/emails/plan-migrated.html`
- `backend/tests/test_quota_enforcement.py`
- `backend/tests/test_cost_preview.py`
- `backend/tests/test_ai_feature_gating.py`
- `backend/tests/test_plan_migration_emails.py`
- `frontend/src/app/piani/page.tsx`
- `frontend/src/app/piani/PlanCard.tsx`
- `frontend/src/app/piani/OverageCalculator.tsx`
- `frontend/src/lib/plans.ts`
- `frontend/tests/pages/piani.test.tsx`

**Modified files (3):**
- `backend/src/api/admin.py` — include new columns in `admin_plans` response
- `backend/src/api/campaigns.py` — add cost-preview endpoint
- `backend/src/api/templates.py` (or wherever AI features live) — wire `require_ai_feature` gates
- `frontend/src/app/(admin)/admin/_components/AdminPlanManagementTab.tsx` — display new fields
- Signup page (exact path to confirm in Task 7) — default plan + upsell

**Estimated effort:** 5-7 giorni di lavoro (1 dev full-time).

**Hard dependencies before starting:** none.

**Downstream unblocked by this:** sub-project B (uses `recommendedPlan` from plans table), sub-project C (uses new schema for Twilio cost aggregation display).
