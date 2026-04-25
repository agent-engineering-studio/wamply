# Campaigns Full Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add delete, test-send, real-time progress polling, and an analytics tab to the campaigns section.

**Architecture:**
- Two new backend endpoints: `DELETE /campaigns/:id`, `POST /campaigns/:id/test-send`
- Frontend: delete button on list + detail page; `TestSendModal` component; progress polling on the detail page; analytics tab with send/delivery/read KPIs

**Tech Stack:** FastAPI + asyncpg (backend), Twilio Python SDK for test-send, Next.js 15 App Router client components, Vitest + @testing-library/react.

---

### Task 1: Backend — DELETE /campaigns/:id

**Files:**
- Modify: `backend/src/api/campaigns.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_campaigns_crud.py`:

```python
import pytest
from httpx import AsyncClient

@pytest.mark.anyio
async def test_delete_draft_campaign(authed_client: AsyncClient, campaign_factory):
    c = await campaign_factory(name="To Delete", status="draft")
    r = await authed_client.delete(f"/campaigns/{c['id']}")
    assert r.status_code == 204
    r2 = await authed_client.get(f"/campaigns/{c['id']}")
    assert r2.status_code == 404

@pytest.mark.anyio
async def test_delete_running_campaign_blocked(authed_client: AsyncClient, campaign_factory):
    c = await campaign_factory(name="Running", status="running")
    r = await authed_client.delete(f"/campaigns/{c['id']}")
    assert r.status_code == 409

@pytest.mark.anyio
async def test_delete_campaign_not_found(authed_client: AsyncClient):
    r = await authed_client.delete("/campaigns/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && pytest tests/test_campaigns_crud.py -v
```
Expected: FAIL.

- [ ] **Step 3: Add DELETE /campaigns/:id**

Append after `update_campaign` in `backend/src/api/campaigns.py`:

```python
@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    request: Request,
    campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    row = await db.fetchrow(
        "SELECT id, status FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    if row["status"] in ("running",):
        raise HTTPException(
            status_code=409,
            detail="Non puoi eliminare una campagna in corso. Attendi il completamento.",
        )
    async with db.acquire() as conn, conn.transaction():
        await conn.execute("DELETE FROM messages WHERE campaign_id = $1", campaign_id)
        await conn.execute(
            "DELETE FROM campaigns WHERE id = $1 AND user_id = $2",
            campaign_id, user.id,
        )
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && pytest tests/test_campaigns_crud.py -v
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/campaigns.py backend/tests/test_campaigns_crud.py
git commit -m "feat(campaigns): add DELETE /campaigns/:id"
```

---

### Task 2: Backend — POST /campaigns/:id/test-send

**Files:**
- Modify: `backend/src/api/campaigns.py`
- Modify: `backend/tests/test_campaigns_crud.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_campaigns_crud.py`:

```python
from unittest.mock import AsyncMock, patch

@pytest.mark.anyio
async def test_test_send(authed_client: AsyncClient, campaign_factory):
    c = await campaign_factory(name="Test Send Campaign", status="draft")
    with patch("src.api.campaigns._do_test_send", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {"sid": "SM123", "status": "queued"}
        r = await authed_client.post(
            f"/campaigns/{c['id']}/test-send",
            json={"to": "whatsapp:+39333000001"},
        )
    assert r.status_code == 200
    assert r.json()["status"] == "queued"

@pytest.mark.anyio
async def test_test_send_missing_to(authed_client: AsyncClient, campaign_factory):
    c = await campaign_factory(name="TS Missing", status="draft")
    r = await authed_client.post(f"/campaigns/{c['id']}/test-send", json={})
    assert r.status_code == 400
```

- [ ] **Step 2: Run to verify they fail**

```
cd backend && pytest tests/test_campaigns_crud.py::test_test_send tests/test_campaigns_crud.py::test_test_send_missing_to -v
```
Expected: FAIL.

- [ ] **Step 3: Add test-send endpoint**

Add helper function and endpoint to `backend/src/api/campaigns.py`. First add import at top:

```python
from src.services.twilio_admin import resolve_master_credentials
from src.services.encryption import decrypt
```

Then append after `delete_campaign`:

```python
async def _do_test_send(db, campaign_id: str, user_id: str, to: str) -> dict:
    """Send a single test message using master Twilio credentials."""
    row = await db.fetchrow(
        """SELECT c.template_id, t.twilio_sid, t.components
           FROM campaigns c LEFT JOIN templates t ON t.id = c.template_id
           WHERE c.id = $1 AND c.user_id = $2""",
        campaign_id, user_id,
    )
    if not row:
        raise ValueError("Campagna non trovata.")
    if not row["twilio_sid"]:
        raise ValueError("Questa campagna non ha un template Twilio valido.")

    creds = await resolve_master_credentials(db)
    account_sid = creds.get("account_sid") or ""
    auth_token = decrypt(creds.get("auth_token_encrypted") or "") if creds.get("auth_token_encrypted") else creds.get("auth_token") or ""
    from_ = creds.get("from_number") or ""

    if not account_sid or not auth_token:
        raise ValueError("Credenziali Twilio master non configurate. Contatta l'amministratore.")

    from twilio.rest import Client as TwilioClient
    client = TwilioClient(account_sid, auth_token)
    msg = client.messages.create(
        to=to,
        from_=from_,
        content_sid=row["twilio_sid"],
        content_variables="{}",
    )
    return {"sid": msg.sid, "status": msg.status}


@router.post("/{campaign_id}/test-send")
async def test_send_campaign(
    request: Request,
    campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Send a single test message to a given number without launching the campaign.

    Body: { "to": "whatsapp:+39333000001" }
    """
    db = get_db(request)
    body = await request.json()
    to = (body.get("to") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Il campo 'to' è obbligatorio (es. whatsapp:+39333000001).")

    row = await db.fetchrow(
        "SELECT id FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")

    try:
        result = await _do_test_send(db, campaign_id, str(user.id), to)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twilio error: {e}")

    return result
```

- [ ] **Step 4: Run all campaign tests**

```
cd backend && pytest tests/test_campaigns_crud.py -v
```
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/campaigns.py backend/tests/test_campaigns_crud.py
git commit -m "feat(campaigns): add POST /campaigns/:id/test-send"
```

---

### Task 3: Frontend — delete button + TestSendModal

**Files:**
- Create: `frontend/src/app/(dashboard)/campaigns/_components/TestSendModal.tsx`
- Modify: `frontend/src/app/(dashboard)/campaigns/page.tsx`
- Modify: `frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/(dashboard)/campaigns/_components/TestSendModal.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestSendModal } from "./TestSendModal";
import { vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sid: "SM123", status: "queued" }) }),
}));

describe("TestSendModal", () => {
  it("renders with phone input", () => {
    render(<TestSendModal open={true} campaignId="c1" onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Numero destinatario/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Invia test/i })).toBeInTheDocument();
  });

  it("shows success after send", async () => {
    render(<TestSendModal open={true} campaignId="c1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Numero destinatario/i), { target: { value: "+39333000001" } });
    fireEvent.click(screen.getByRole("button", { name: /Invia test/i }));
    await waitFor(() => expect(screen.getByText(/Messaggio inviato/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && npx vitest run src/app/\(dashboard\)/campaigns/_components/TestSendModal.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create TestSendModal**

Create `frontend/src/app/(dashboard)/campaigns/_components/TestSendModal.tsx`:

```typescript
"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  campaignId: string;
  onClose: () => void;
}

export function TestSendModal({ open, campaignId, onClose }: Props) {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sid: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    setTo("");
    setResult(null);
    setError(null);
    onClose();
  }

  async function handleSend() {
    if (!to.trim()) { setError("Inserisci un numero destinatario."); return; }
    setSending(true);
    setError(null);
    try {
      const phone = to.trim().startsWith("whatsapp:") ? to.trim() : `whatsapp:${to.trim()}`;
      const r = await apiFetch(`/campaigns/${campaignId}/test-send`, {
        method: "POST",
        body: JSON.stringify({ to: phone }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore invio test.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card">
        <h2 className="mb-1 text-[15px] font-semibold text-slate-100">Invia messaggio di test</h2>
        <p className="mb-4 text-[12px] text-slate-400">
          Invia un singolo messaggio al numero indicato per verificare il template prima del lancio.
        </p>

        {!result && (
          <>
            {error && (
              <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                {error}
              </div>
            )}
            <label htmlFor="ts-to" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Numero destinatario
            </label>
            <input
              id="ts-to"
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+39 333 1234567"
              className="mb-4 w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
              >
                {sending ? "Invio…" : "Invia test"}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300">
              <strong>Messaggio inviato</strong>
              <p className="mt-1 font-mono text-[11px] text-slate-400">SID: {result.sid} · Stato: {result.status}</p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd frontend && npx vitest run src/app/\(dashboard\)/campaigns/_components/TestSendModal.test.tsx
```
Expected: 2 PASS.

- [ ] **Step 5: Add delete to campaigns list page**

In `frontend/src/app/(dashboard)/campaigns/page.tsx`:

1. Convert the campaign list from `<Link>` to a `<div>` with separate click handlers (the whole card can navigate, but there's now an action row):

Add state after `wizardOpen`:
```typescript
const [deletingId, setDeletingId] = useState<string | null>(null);
```

Add delete handler after `reload`:
```typescript
async function handleDelete(e: React.MouseEvent, id: string, name: string) {
  e.preventDefault();
  e.stopPropagation();
  if (!confirm(`Eliminare la campagna "${name}"? I dati di invio verranno persi.`)) return;
  setDeletingId(id);
  try {
    const r = await apiFetch(`/campaigns/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${r.status}`);
    }
    reload();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Errore durante l'eliminazione.");
  } finally {
    setDeletingId(null);
  }
}
```

2. Inside the campaign card (after the progress bar), add an action row visible on hover:

Replace `<Link key={c.id} href={...}>` block contents — keep the Link but add this footer inside:
```typescript
{(c.status === "draft" || c.status === "completed" || c.status === "failed") && (
  <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-800/50 pt-2">
    <button
      type="button"
      onClick={(e) => handleDelete(e, c.id, c.name)}
      disabled={deletingId === c.id}
      className="text-[11px] text-rose-400 hover:text-rose-300 disabled:opacity-40"
    >
      {deletingId === c.id ? "Eliminazione…" : "Elimina"}
    </button>
  </div>
)}
```

- [ ] **Step 6: Add delete + test-send to campaign detail page**

In `frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`:

1. Add import:
```typescript
import { TestSendModal } from "../_components/TestSendModal";
```

2. Add state:
```typescript
const [testSendOpen, setTestSendOpen] = useState(false);
const [deleting, setDeleting] = useState(false);
```

3. Add delete handler after `handleLaunch`:
```typescript
async function handleDelete() {
  if (!confirm(`Eliminare la campagna "${campaign?.name}"?`)) return;
  setDeleting(true);
  try {
    const r = await apiFetch(`/campaigns/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${r.status}`);
    }
    router.push("/campaigns");
  } catch (e) {
    alert(e instanceof Error ? e.message : "Errore eliminazione.");
    setDeleting(false);
  }
}
```

4. In the header action area (where "Lancia" button is), add test-send and delete buttons for draft campaigns:
```typescript
{campaign.status === "draft" && (
  <>
    <button
      type="button"
      onClick={() => setTestSendOpen(true)}
      className="rounded-pill border border-brand-teal/50 px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal hover:bg-brand-teal/10"
    >
      Invia test
    </button>
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-pill border border-rose-500/30 px-4 py-2 text-[13px] font-medium text-rose-400 hover:border-rose-400 disabled:opacity-40"
    >
      {deleting ? "Eliminazione…" : "Elimina"}
    </button>
  </>
)}
```

5. Add TestSendModal before closing fragment:
```typescript
<TestSendModal
  open={testSendOpen}
  campaignId={String(id)}
  onClose={() => setTestSendOpen(false)}
/>
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/\(dashboard\)/campaigns/_components/TestSendModal.tsx \
        frontend/src/app/\(dashboard\)/campaigns/_components/TestSendModal.test.tsx \
        frontend/src/app/\(dashboard\)/campaigns/page.tsx \
        frontend/src/app/\(dashboard\)/campaigns/\[id\]/page.tsx
git commit -m "feat(campaigns): add delete + test-send UI"
```

---

### Task 4: Frontend — real-time progress polling during send

**Files:**
- Modify: `frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/(dashboard)/campaigns/[id]/_components/SendProgress.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { SendProgress } from "./SendProgress";

describe("SendProgress", () => {
  it("shows 0% when no messages sent", () => {
    render(<SendProgress stats={{ total: 100, sent: 0, delivered: 0, read: 0, failed: 0 }} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("shows 50% when half sent", () => {
    render(<SendProgress stats={{ total: 100, sent: 50, delivered: 40, read: 10, failed: 0 }} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows failed count when > 0", () => {
    render(<SendProgress stats={{ total: 100, sent: 100, delivered: 90, read: 10, failed: 5 }} />);
    expect(screen.getByText(/5 falliti/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && npx vitest run src/app/\(dashboard\)/campaigns/\[id\]/_components/SendProgress.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create SendProgress component**

Create `frontend/src/app/(dashboard)/campaigns/[id]/_components/SendProgress.tsx`:

```typescript
interface Stats { total: number; sent: number; delivered: number; read: number; failed: number }

interface Props { stats: Stats }

export function SendProgress({ stats }: Props) {
  const pct = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;
  const deliveryPct = stats.sent > 0 ? Math.round((stats.delivered / stats.sent) * 100) : 0;
  const readPct = stats.sent > 0 ? Math.round((stats.read / stats.sent) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="text-slate-400">Invio in corso…</span>
        <span className="font-semibold text-brand-teal">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-brand-teal transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 text-center text-[12px]">
        <div>
          <div className="font-semibold text-slate-100">{stats.sent}/{stats.total}</div>
          <div className="text-slate-500">Inviati</div>
        </div>
        <div>
          <div className="font-semibold text-brand-teal">{deliveryPct}%</div>
          <div className="text-slate-500">Consegnati</div>
        </div>
        <div>
          <div className="font-semibold text-brand-teal">{readPct}%</div>
          <div className="text-slate-500">Letti</div>
        </div>
      </div>
      {stats.failed > 0 && (
        <div className="rounded-sm border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-center text-[11.5px] text-rose-300">
          {stats.failed} falliti
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd frontend && npx vitest run src/app/\(dashboard\)/campaigns/\[id\]/_components/SendProgress.test.tsx
```
Expected: 3 PASS.

- [ ] **Step 5: Wire polling into detail page**

In `frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`:

1. Add import:
```typescript
import { SendProgress } from "./_components/SendProgress";
```

2. Add polling effect (after the initial `useEffect` that loads the campaign):
```typescript
useEffect(() => {
  if (!campaign || campaign.status !== "running") return;
  const interval = setInterval(() => {
    apiFetch(`/campaigns/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setCampaign(data);
        if (data.status !== "running") clearInterval(interval);
      });
  }, 3000);
  return () => clearInterval(interval);
}, [campaign?.status, id]);
```

3. In the campaign detail body (below the stats cards but above AI insights), add progress bar when running:
```typescript
{campaign.status === "running" && (
  <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
    <SendProgress stats={campaign.stats ?? EMPTY_STATS} />
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(dashboard\)/campaigns/\[id\]/_components/SendProgress.tsx \
        frontend/src/app/\(dashboard\)/campaigns/\[id\]/_components/SendProgress.test.tsx \
        frontend/src/app/\(dashboard\)/campaigns/\[id\]/page.tsx
git commit -m "feat(campaigns): add SendProgress component with polling"
```

---

### Task 5: Frontend — analytics dashboard tab on campaign detail

**Files:**
- Create: `frontend/src/app/(dashboard)/campaigns/[id]/_components/CampaignAnalytics.tsx`
- Modify: `frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/(dashboard)/campaigns/[id]/_components/CampaignAnalytics.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { CampaignAnalytics } from "./CampaignAnalytics";

const stats = { total: 200, sent: 200, delivered: 180, read: 120, failed: 3 };

describe("CampaignAnalytics", () => {
  it("shows KPI cards", () => {
    render(<CampaignAnalytics stats={stats} />);
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();  // delivery rate
    expect(screen.getByText("67%")).toBeInTheDocument();  // read rate (120/180)
    expect(screen.getByText("3")).toBeInTheDocument();    // failed
  });

  it("shows delivery bar", () => {
    render(<CampaignAnalytics stats={stats} />);
    expect(screen.getByText(/Tasso consegna/i)).toBeInTheDocument();
    expect(screen.getByText(/Tasso lettura/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && npx vitest run src/app/\(dashboard\)/campaigns/\[id\]/_components/CampaignAnalytics.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create CampaignAnalytics**

Create `frontend/src/app/(dashboard)/campaigns/[id]/_components/CampaignAnalytics.tsx`:

```typescript
interface Stats { total: number; sent: number; delivered: number; read: number; failed: number }

interface Props { stats: Stats }

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-[24px] font-bold text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function RateBar({ label, rate, color }: { label: string; rate: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-slate-400">{label}</span>
        <span className={`font-semibold ${color}`}>{rate}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all ${color === "text-brand-teal" ? "bg-brand-teal" : "bg-indigo-400"}`}
          style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

export function CampaignAnalytics({ stats }: Props) {
  const deliveryRate = stats.sent > 0 ? Math.round((stats.delivered / stats.sent) * 100) : 0;
  const readRate = stats.delivered > 0 ? Math.round((stats.read / stats.delivered) * 100) : 0;
  const failRate = stats.sent > 0 ? Math.round((stats.failed / stats.sent) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Destinatari" value={String(stats.total)} sub="contatti target" />
        <StatCard label="Consegna" value={`${deliveryRate}%`} sub={`${stats.delivered} su ${stats.sent}`} />
        <StatCard label="Lettura" value={`${readRate}%`} sub={`${stats.read} letti`} />
        <StatCard
          label="Falliti"
          value={String(stats.failed)}
          sub={failRate > 0 ? `${failRate}% dei messaggi` : "nessuno"}
        />
      </div>

      <div className="rounded-card border border-slate-800 bg-brand-navy-light p-5 shadow-card">
        <h3 className="mb-4 text-[13.5px] font-semibold text-slate-100">Funnel di consegna</h3>
        <div className="space-y-3">
          <RateBar label="Tasso consegna" rate={deliveryRate} color="text-brand-teal" />
          <RateBar label="Tasso lettura" rate={readRate} color="text-indigo-400" />
        </div>
        <p className="mt-4 text-[11px] text-slate-500">
          I tassi vengono aggiornati man mano che Twilio notifica lo stato dei messaggi (webhook).
          Il tasso lettura può essere basso se i destinatari usano WhatsApp Web.
        </p>
      </div>

      {stats.failed > 0 && (
        <div className="rounded-sm border border-rose-500/20 bg-rose-500/10 p-4">
          <p className="text-[12.5px] text-rose-300">
            <strong>{stats.failed} messaggi non consegnati.</strong>{" "}
            I motivi più comuni sono: numero non registrato su WhatsApp, opt-out, o template non approvato.
            Verifica la configurazione Twilio e il template usato.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd frontend && npx vitest run src/app/\(dashboard\)/campaigns/\[id\]/_components/CampaignAnalytics.test.tsx
```
Expected: 2 PASS.

- [ ] **Step 5: Add analytics tab to detail page**

In `frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`:

1. Add import:
```typescript
import { CampaignAnalytics } from "./_components/CampaignAnalytics";
```

2. Add tab state (after `launching`):
```typescript
const [activeTab, setActiveTab] = useState<"overview" | "analytics">("overview");
```

3. After the campaign header section, add a tab bar (show only when campaign has sends):
```typescript
{(s.sent > 0 || campaign.status === "completed") && (
  <div className="mb-5 flex gap-1 border-b border-slate-800">
    {(["overview", "analytics"] as const).map((tab) => (
      <button
        key={tab}
        type="button"
        onClick={() => setActiveTab(tab)}
        className={`pb-2 px-3 text-[13px] font-medium border-b-2 transition-colors ${
          activeTab === tab
            ? "border-brand-teal text-brand-teal"
            : "border-transparent text-slate-400 hover:text-slate-300"
        }`}
      >
        {tab === "overview" ? "Panoramica" : "Analitiche"}
      </button>
    ))}
  </div>
)}
```

4. Wrap existing stats content in a tab conditional; add analytics tab:
```typescript
{activeTab === "overview" ? (
  /* existing stats cards + insights content */
  <> ... </>
) : (
  <CampaignAnalytics stats={s} />
)}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(dashboard\)/campaigns/\[id\]/_components/CampaignAnalytics.tsx \
        frontend/src/app/\(dashboard\)/campaigns/\[id\]/_components/CampaignAnalytics.test.tsx \
        frontend/src/app/\(dashboard\)/campaigns/\[id\]/page.tsx
git commit -m "feat(campaigns): add CampaignAnalytics tab with KPI cards and funnel chart"
```

---

### Self-review

**Spec coverage:**
- ✅ Delete campaign (draft/completed/failed only; running blocked) → DELETE /campaigns/:id + list + detail buttons
- ✅ Test-send before launch → POST /campaigns/:id/test-send + TestSendModal
- ✅ Progress bar during send → SendProgress + 3-second polling
- ✅ Analytics dashboard on send stats → CampaignAnalytics tab (delivery, read, failed KPIs + funnel bars)
- ✅ User response/feedback stats → delivery + read rates (Twilio webhook data surfaced)

**Placeholder scan:** No TBDs.

**Type consistency:** `CampaignStats` interface (`total, sent, delivered, read, failed`) used consistently across page, SendProgress, and CampaignAnalytics.
