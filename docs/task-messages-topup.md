# Task: Sistema "Crediti WhatsApp" (pacchetti messaggi top-up)

> Documento tecnico di implementazione.
> Versione: 2026-04-21
> Complemento a `business-model.md` §4.3 e `architecture-twilio-multitenant.md`.

---

## 1. Obiettivo

Implementare un sistema di top-up parallelo ai crediti AI, ma dedicato ai **messaggi WhatsApp** (consumo Twilio). Stesso pattern di `ai_credit_balance` / `ai_credit_purchases`, nuovo nome: `whatsapp_credit_balance` / `whatsapp_credit_purchases`.

**Key differences vs crediti AI:**

- **Sempre disponibile** (anche per utenti BYOK Claude): Twilio è sempre gestito da Wamply
- **Contatore per-piano**: `usage_counters.messages_used` esiste già, lo riutilizziamo
- **Top-up decremento**: nuovo campo `usage_counters.messages_topup_remaining` oppure nuova tabella dedicata
- **Consumo**: 1 messaggio WhatsApp inviato = 1 credito WhatsApp decrementato
- **Nomenclatura UI**: "Crediti WhatsApp" (deciso come D5.c)

---

## 2. Schema DB (migration 023)

### 2.1 Nuova tabella `whatsapp_credit_balance`

```sql
CREATE TABLE IF NOT EXISTS whatsapp_credit_balance (
  user_id          uuid          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  topup_messages   integer       NOT NULL DEFAULT 0,
  topup_expires_at timestamptz,
  updated_at       timestamptz   NOT NULL DEFAULT now()
);
```

### 2.2 Nuova tabella `whatsapp_credit_purchases`

```sql
CREATE TABLE IF NOT EXISTS whatsapp_credit_purchases (
  id                          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_slug                   text         NOT NULL,            -- 'small' | 'medium' | 'large'
  messages_purchased          integer      NOT NULL,
  amount_cents                integer      NOT NULL,
  stripe_payment_intent_id    text,
  stripe_checkout_session_id  text         UNIQUE,
  status                      text         NOT NULL DEFAULT 'pending',
  created_at                  timestamptz  NOT NULL DEFAULT now(),
  completed_at                timestamptz
);

CREATE INDEX idx_wa_purchases_user_created
  ON whatsapp_credit_purchases (user_id, created_at DESC);
CREATE INDEX idx_wa_purchases_status
  ON whatsapp_credit_purchases (status);
```

### 2.3 Idempotenza warning/exhaustion

```sql
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS whatsapp_credits_80_warning_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_credits_100_reached_at      timestamptz;
```

---

## 3. Pacchetti (catalog)

Deciso **D2.c** (via di mezzo):

| Pack | Slug | Messaggi | Prezzo | €/messaggio | Badge |
|------|------|---------:|-------:|------------:|-------|
| Small | `small` | 500 | €39 | €0.078 | — |
| Medium | `medium` | 2.000 | €129 | €0.0645 | Più venduto |
| Large | `large` | 5.000 | €279 | €0.0558 | Miglior prezzo |

**Note pricing:**
- Margin minimo Large: ~€0,009/msg (vs €0,065 costo Twilio = ~14% margine lordo). Stretto ma accettabile
- Pack XL rimosso: chi fa 10k+/mese va su Enterprise/custom
- I prezzi sono **IVA esclusa** (configurabile su Stripe con Tax)

---

## 4. Service backend

### 4.1 Nuovo file `backend/src/services/whatsapp_credits.py`

Ricalca `credit_topup.py` (pattern AI credits) ma per messaggi.

Funzioni principali:

```python
PACKS: dict[str, Pack] = {
    "small":  Pack("small",  500,  3900,  "500 messaggi WhatsApp",    "STRIPE_PRICE_WA_SMALL"),
    "medium": Pack("medium", 2000, 12900, "2.000 messaggi WhatsApp",  "STRIPE_PRICE_WA_MEDIUM", "Più venduto"),
    "large":  Pack("large",  5000, 27900, "5.000 messaggi WhatsApp",  "STRIPE_PRICE_WA_LARGE",  "Miglior prezzo"),
}

TOPUP_VALIDITY_DAYS = 365


async def list_packs() -> list[dict]: ...

async def can_purchase_whatsapp_topup(db, user_id) -> tuple[bool, str | None]:
    """Only paying plans. BYOK Claude NON blocca: WhatsApp è sempre Wamply."""
    sub = await db.fetchrow(
        "SELECT p.slug AS plan_slug "
        "FROM subscriptions s JOIN plans p ON p.id = s.plan_id "
        "WHERE s.user_id = $1 AND s.status IN ('active', 'trialing')",
        user_id,
    )
    if not sub:
        return False, "Nessun abbonamento attivo."
    if sub["plan_slug"] == "free":
        return False, "Scegli un piano pagante prima di acquistare messaggi extra."
    return True, None


async def create_whatsapp_topup_checkout_session(
    db, user_id, user_email, pack_slug, app_url
) -> str:
    """Identico pattern a credit_topup ma per whatsapp_credits.
    metadata.type = 'whatsapp_topup' per discriminare webhook."""
    ...


async def apply_whatsapp_topup_purchase(db, session_id, payment_intent_id) -> bool:
    """Idempotente. Marca purchase completed + UPSERT balance."""
    ...


async def get_whatsapp_balance(db, user_id) -> dict:
    """{topup_messages, topup_expires_at, expired}"""
    ...


async def get_whatsapp_purchase_history(db, user_id, limit=50) -> list[dict]: ...


async def consume_whatsapp_topup(db, user_id, messages: int) -> None: ...
```

### 4.2 Update webhook dispatcher

In `backend/src/services/billing.py`, il handler `checkout.session.completed` già discrimina `metadata.type == "topup"` per crediti AI. Aggiungere:

```python
if event_type == "checkout.session.completed":
    metadata = obj.get("metadata") or {}

    if metadata.get("type") == "topup":
        # existing ai credit topup handler
        from src.services.credit_topup import apply_topup_purchase
        await apply_topup_purchase(db, obj["id"], obj.get("payment_intent"))

    elif metadata.get("type") == "whatsapp_topup":
        # NEW: whatsapp topup handler
        from src.services.whatsapp_credits import apply_whatsapp_topup_purchase
        await apply_whatsapp_topup_purchase(db, obj["id"], obj.get("payment_intent"))

    elif obj.get("mode") == "subscription" and obj.get("subscription"):
        # existing subscription handler
        ...
```

### 4.3 Integrazione con `plan_limits.py`

Il check corrente `check_plan_limit(resource="messages")` considera solo il piano. Va esteso:

```python
# In plan_limits.py, nella limit_map, resource "messages":
limit_plan, used = limit_map["messages"]

# Nuovo: considera anche topup
topup = await get_whatsapp_balance(db, user_id)
topup_remaining = topup["topup_messages"]

if limit_plan != -1 and used >= limit_plan:
    # Piano esaurito, verifica topup
    if topup_remaining <= 0:
        raise HTTPException(status_code=402, detail="Messaggi esauriti. Ricarica.")
    # Altrimenti passa (consumo da topup)

# In increment messaggi:
# Se plan_remaining > 0: incrementa plan_counter
# Altrimenti: consuma da topup
```

Questo richiede refactor significativo di `plan_limits.py` per gestire il dual accounting. **Proposta:** creare funzione `consume_message_credit()` dedicata che fa tutta la logica, invocata dal worker di invio campagna.

---

## 5. Endpoint API

### 5.1 Public (JWT)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/billing/whatsapp-topup/packs` | Catalog pacchetti (pubblico per UI) |
| POST | `/billing/whatsapp-topup/checkout` | Crea Stripe Checkout Session |
| GET | `/billing/whatsapp-topup/history` | Storico acquisti utente |

Payload esempio:

```json
// POST /billing/whatsapp-topup/checkout
{ "pack_slug": "medium" }

// Response
{ "checkout_url": "https://checkout.stripe.com/..." }
```

### 5.2 Admin (staff)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/admin/whatsapp-topup/purchases` | Lista globale acquisti (per reporting) |
| POST | `/admin/whatsapp-topup/refund/{purchase_id}` | Refund manuale (future) |

### 5.3 Update `/settings/agent-status` o nuovo endpoint `/settings/usage-status`

Oggi `/settings/agent-status` espone solo dati AI. Proposta: nuovo endpoint **`/settings/usage-status`** che espone tutto:

```json
{
  "ai": {
    "active": true,
    "source": "wamply" | "byok",
    "plan_credits_limit": 200,
    "plan_credits_used": 137,
    "plan_credits_remaining": 63,
    "topup_credits": 100,
    "topup_expires_at": "2027-04-21T..."
  },
  "whatsapp": {
    "plan_messages_limit": 2500,
    "plan_messages_used": 1820,
    "plan_messages_remaining": 680,
    "topup_messages": 0,
    "topup_expires_at": null
  }
}
```

---

## 6. Stripe setup manuale

Nel Stripe Dashboard (test + live):

1. **Products → Add product**:
   - Wamply 500 messaggi WhatsApp — €39 — **one-time** (non recurring)
   - Wamply 2.000 messaggi WhatsApp — €129 — one-time
   - Wamply 5.000 messaggi WhatsApp — €279 — one-time

2. Dopo creazione, copia ogni `price_id` e mettili in `.env`:

```
STRIPE_PRICE_WA_SMALL=price_...
STRIPE_PRICE_WA_MEDIUM=price_...
STRIPE_PRICE_WA_LARGE=price_...
```

3. Aggiungi al `docker-compose.yml` (backend service):

```yaml
- STRIPE_PRICE_WA_SMALL=${STRIPE_PRICE_WA_SMALL:-}
- STRIPE_PRICE_WA_MEDIUM=${STRIPE_PRICE_WA_MEDIUM:-}
- STRIPE_PRICE_WA_LARGE=${STRIPE_PRICE_WA_LARGE:-}
```

4. Aggiungi a `.env.example`:

```
# Top-up WhatsApp credits (Pacchetti messaggi)
STRIPE_PRICE_WA_SMALL=price_wa_small_xxxxx
STRIPE_PRICE_WA_MEDIUM=price_wa_medium_xxxxx
STRIPE_PRICE_WA_LARGE=price_wa_large_xxxxx
```

---

## 7. UI cambiamenti

### 7.1 Rinominare `/settings/credits` → `/settings/usage`

La pagina attuale `/settings/credits` è dedicata solo ai crediti AI. Va estesa a pagina universale con **due sezioni** (tab o scroll):

- **Crediti AI** (quanto già esistente)
- **Crediti WhatsApp** (nuovo)

**Layout proposto** (ispirato al pattern già esistente):

```
┌─ Card Riepilogo (hero) ────────────────────────────────┐
│                                                          │
│  ┌─ Crediti AI ────────┐  ┌─ Crediti WhatsApp ───────┐ │
│  │ 263 disponibili     │  │ 680 disponibili          │ │
│  │ 137/200 piano       │  │ 1.820/2.500 piano        │ │
│  │ + 100 top-up        │  │ + 0 top-up               │ │
│  │ [Ricarica]          │  │ [Ricarica]               │ │
│  └─────────────────────┘  └──────────────────────────┘ │
│                                                          │
│  (solo se BYOK Claude: card AI nascosta o sostituita    │
│   da "Usi la tua chiave Claude — nessun credito AI"     │
│   in card informativa)                                   │
└──────────────────────────────────────────────────────────┘

┌─ Tab/accordion: Ricarica Crediti AI ────────────────────┐
│  [Pack AI cards come ora]                                │
│  (nascosto se BYOK Claude)                               │
└──────────────────────────────────────────────────────────┘

┌─ Tab/accordion: Ricarica Crediti WhatsApp ──────────────┐
│  [Pack WhatsApp cards — sempre visibile]                 │
└──────────────────────────────────────────────────────────┘

┌─ Consumo mese corrente ─────────────────────────────────┐
│  Ripartizione AI (chat, template, personalize, ...)     │
│  Ripartizione WhatsApp (per campagna / per mese)        │
└──────────────────────────────────────────────────────────┘

┌─ Storico acquisti ──────────────────────────────────────┐
│  Tabella mista (tipo: AI / WhatsApp)                     │
└──────────────────────────────────────────────────────────┘

┌─ FAQ ────────────────────────────────────────────────────┐
│  - Cosa sono i crediti AI?                               │
│  - Cosa sono i crediti WhatsApp?                         │
│  - Perché 2 sistemi separati?                            │
│  - Posso rimborsare un top-up?                           │
│  - I crediti scadono?                                    │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Redirect / alias

Tenere `/settings/credits` come alias permanente → 301 verso `/settings/usage` per mantenere bookmark esistenti.

### 7.3 Banner CreditsBanner → UsageBanner

Il componente `CreditsBanner` attuale mostra solo crediti AI. Estenderlo per gestire **entrambi** i tipi:

- Se crediti AI in esaurimento (80%+) → amber con CTA "Ricarica"
- Se crediti WhatsApp in esaurimento → amber separato
- Se entrambi esauriti → rose con CTA "Ricarica"
- Se solo uno esaurito → rose + amber affiancati

### 7.4 Sidebar voce "Crediti AI" → "Crediti & Consumo"

Rinomina la voce sidebar da "Crediti AI" a **"Crediti e Consumo"** che riflette la pagina unificata.

---

## 8. Email reminder

### 8.1 Template nuovi

In `backend/templates/emails/`:

- `whatsapp-credits-warning-80.html` — simile a `ai-credits-warning-80.html` ma con wording WhatsApp
- `whatsapp-credits-exhausted.html` — simile a `ai-credits-exhausted.html`

### 8.2 Background task

Estendere `ai_credit_reminders.py` oppure creare nuovo `whatsapp_credit_reminders.py` che gira nello stesso loop:

```python
async def _usage_reminder_loop(pool: asyncpg.Pool) -> None:
    await asyncio.sleep(45)
    while True:
        try:
            r_ai = await run_credit_reminders(pool)          # esistente
            r_wa = await run_whatsapp_reminders(pool)         # nuovo
            if any([r_ai.get('80'), r_ai.get('100'), r_wa.get('80'), r_wa.get('100')]):
                logger.info("usage_reminders_run", ai=r_ai, whatsapp=r_wa)
        except Exception as exc:
            logger.warning("usage_reminders_loop_error", error=str(exc))
        await asyncio.sleep(3600)
```

Oppure due loop separati (mia preferenza: separati per isolamento).

### 8.3 Query `run_whatsapp_reminders`

Query analoga a `run_credit_reminders` ma usa `usage_counters.messages_used` e `plans.max_messages_month`:

```sql
SELECT
  s.id AS sub_id, s.user_id,
  s.whatsapp_credits_80_warning_sent_at,
  s.whatsapp_credits_100_reached_at,
  u.email, u.full_name,
  p.name AS plan_name, p.max_messages_month AS msg_limit,
  COALESCE(uc.messages_used, 0) AS msg_used
FROM subscriptions s
JOIN users u ON u.id = s.user_id
JOIN plans p ON p.id = s.plan_id
LEFT JOIN usage_counters uc
  ON uc.user_id = s.user_id
  AND uc.period_start = date_trunc('month', now())::date
WHERE s.status IN ('active', 'trialing')
  AND p.max_messages_month > 0
  AND COALESCE(uc.messages_used, 0) >= 0.8 * p.max_messages_month
```

---

## 9. Admin dashboard — aggiornamenti

### 9.1 Tab "AI Revenue" → "Revenue"

Rinomina la tab admin. Aggiungi blocchi per top-up WhatsApp:

- KPI card: "Top-up WhatsApp revenue (30g)"
- Tabella "Top-up WhatsApp per pacchetto"
- Heavy buyers WhatsApp (3+ acquisti/mese = candidati upgrade Enterprise)

### 9.2 Endpoint `/admin/ai/revenue` → `/admin/revenue`

Aggiornare endpoint backend per includere sia AI sia WhatsApp:

```json
{
  "days": 30,
  "subscription": { "mrr_cents": ..., "by_plan": [...] },
  "ai_topup": { "total_cents": ..., "by_pack": [...], ... },
  "whatsapp_topup": { "total_cents": ..., "by_pack": [...], ... },
  "total_revenue_cents": mrr + ai_topup + whatsapp_topup,
  "heavy_buyers": {
    "ai": [...],
    "whatsapp": [...]
  }
}
```

### 9.3 Tab "AI Costs" → "Costs"

Aggiungere tab separato o estendere per includere costi Twilio aggregati:

- Costo Anthropic (system_key only) — come ora
- Costo Twilio stimato = messaggi_inviati × €0,065 — nuovo

---

## 10. Mock data e testing

### 10.1 Seed per test

Per testare senza Stripe reale:

```sql
-- Assegna top-up whatsapp manualmente a user1
INSERT INTO whatsapp_credit_balance (user_id, topup_messages, topup_expires_at)
VALUES ((SELECT id FROM users WHERE email='user1@test.local'),
        1000,
        now() + interval '365 days');

INSERT INTO whatsapp_credit_purchases
  (user_id, pack_slug, messages_purchased, amount_cents, status, completed_at)
VALUES ((SELECT id FROM users WHERE email='user1@test.local'),
        'medium', 2000, 12900, 'completed', now());
```

### 10.2 Scenari di test

Aggiungere a `docs/testing-guide.md` nuova sezione **"2.15 WhatsApp topup (5 min)"**:

1. `/settings/usage` → sezione Crediti WhatsApp → click "Acquista" su Medium
2. Stripe Checkout → carta 4242... → paga
3. Webhook `stripe listen` → `checkout.session.completed` con `metadata.type=whatsapp_topup`
4. Balance aggiornato: `+2.000` messaggi
5. Sezione "Storico acquisti" mostra la nuova riga

### 10.3 Test consumo dual

Simulare campagna a 3.000 destinatari su user Pro (piano 2.500 + topup 2.000):
- Si consumano 2.500 dal piano
- Poi 500 da topup (restano 1.500)
- Banner mostra: "Stai usando crediti WhatsApp top-up"

---

## 11. Policy consumo

### 11.1 Priorità piano-first

Identica al pattern AI credits:

```
Per ogni messaggio inviato:
  1. Incrementa plan_counter se plan_remaining > 0
  2. Altrimenti: decrementa topup_messages
  3. Se entrambi a 0: blocca invio (HTTP 402 al worker)
```

### 11.2 Hard block vs soft throttle

**Hard block** quando crediti a 0 (coerente con policy Wamply "zero bill shock"):
- Worker ferma la campagna in invio
- Stato campagna: `paused_for_credits`
- Banner dashboard: "Campagna in pausa. Ricarica per continuare"
- Utente deve manualmente resumare dopo ricarica

### 11.3 Campaign-level check

Prima di lanciare una campagna, verifica:

```python
async def validate_campaign_budget(db, user_id, target_count) -> tuple[bool, str | None]:
    """Return (ok, reason). Campaign launch blocked if combined credits
    insufficient for the target audience."""
    status = await get_whatsapp_balance(db, user_id)
    sub = await get_user_plan(db, user_id)
    plan_remaining = max(0, sub['max_messages_month'] - sub['messages_used_this_month'])
    combined = plan_remaining + status['topup_messages']

    if combined < target_count:
        return False, (
            f"La campagna richiede {target_count} messaggi ma ne hai "
            f"{combined} disponibili. Ricarica con un pacchetto."
        )
    return True, None
```

Chiamata dal frontend prima del "Lancia campagna" button abilitato.

---

## 12. Stima tempo implementazione

| Task | Tempo |
|------|-------|
| Migration 023 | 1h |
| Service `whatsapp_credits.py` | 3h |
| Endpoint API `/billing/whatsapp-topup/*` | 2h |
| Estensione webhook handler | 1h |
| Update `plan_limits.py` per dual consume | 4h |
| Update `/settings/usage` UI (refactor pagina) | 4h |
| Sidebar rinomina + banner dual | 1h |
| Template email + background loop | 2h |
| Update admin dashboard Revenue/Costs | 3h |
| Stripe setup + test end-to-end | 2h |
| **Totale** | **~23h (3 giorni lavoro)** |

---

## 13. Checklist go-live

- [ ] Migration 023 applicata in dev
- [ ] Backend service + endpoint funzionanti (test con curl)
- [ ] Webhook handler riconosce `metadata.type=whatsapp_topup`
- [ ] Stripe Prices creati in test mode + `price_id` in `.env`
- [ ] UI `/settings/usage` mostra 2 sezioni corrette
- [ ] Acquisto top-up completato end-to-end in test
- [ ] Bilancio aggiornato post-webhook
- [ ] Storico acquisti mostra riga corretta
- [ ] Email warning 80% WhatsApp arriva
- [ ] Email exhausted 100% WhatsApp arriva
- [ ] Hard block campagna al raggiungimento limite
- [ ] Admin dashboard Revenue mostra top-up WhatsApp separato
- [ ] Testing-guide.md aggiornato con sezione 2.15
- [ ] README.md aggiornato con env vars nuove
- [ ] Backend restart + smoke test

---

## 14. Note aperte

- **Rinomina link sidebar** da "Crediti AI" a "Crediti e Consumo": impatta l'UX di utenti abituati. Valutare tooltip transitorio "Questa sezione ora include anche i crediti WhatsApp".
- **Trasparenza prezzi Twilio**: comunichiamo nella FAQ che 1 credito WhatsApp = 1 messaggio? O nascondiamo questa info? Proposta: **trasparenza totale** ("Ogni messaggio costa 1 credito").
- **Conversation windows WhatsApp**: Twilio fattura per "conversation" (24h) non per singolo messaggio. Un cliente può mandare N messaggi in 24h allo stesso destinatario consumando **1 conversation**. Dobbiamo decidere:
  - Opzione A: 1 credito = 1 messaggio (semplice, ma sfavorevole a Wamply su conversazioni multi-messaggio)
  - Opzione B: 1 credito = 1 conversation (più allineato al costo reale, ma confusing per l'utente)
  - **Default proposto**: Opzione A, accettiamo margine ridotto in cambio di semplicità UX
- **Messaggi "utility" (notifiche) vs "marketing"**: Twilio costa €0,03 vs €0,065. Noi vendiamo un credito generico. In futuro si può splittare se diventa tema.

---

*Dopo go-live di questo task, considera implementare il **proration** al cambio piano: se un utente passa da Pro (2.500 msg) a Enterprise (10.000 msg) mid-month, Stripe fa la proration sul prezzo — noi dobbiamo farla sul counter messaggi.*
