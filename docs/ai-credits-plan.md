# AI Credits Plan — Handoff per sessioni Claude Code future

> **Scopo di questo documento.** Riassumere il lavoro svolto e concordato in una sessione Claude Code lunga (2026-04-21) su: Trial 14gg, Stripe Billing, piano crediti AI con routing silente Claude, BYOK, top-up crediti, dashboard user/admin. Serve a far partire una nuova sessione con il contesto pieno, senza dover rileggere la conversazione.
>
> Lo stato del codice al momento della scrittura è **parzialmente implementato**. Le sezioni sotto distinguono chiaramente cosa è `FATTO`, cosa è `DECISO-DA-FARE`, cosa è `DA-DECIDERE`.

---

## 1. Stato del progetto Wamply (sintesi)

**Cosa è:** SaaS per campagne WhatsApp con agent AI (Claude) che personalizza ogni messaggio. Stack: Next.js 15 + FastAPI + Supabase (Postgres+GoTrue) + Redis + Twilio.

**Gerarchia servizi e porte:**
- `frontend` (:3000) — Next.js App Router, solo UI
- `backend` (:8200) — CRUD, plan limits, billing, admin API
- `agent` (:8000) — chat agent con tool-use, campaign worker
- `supabase-kong` (:8100) — gateway, routing `/api/v1/*` → backend, `/agent/v1/*` → agent
- `supabase-auth` GoTrue (:9999), `supabase-rest` PostgREST (:3001), `supabase-db` Postgres (:5432)
- `redis` (:6379), `mailhog` (:8025 UI, :1025 SMTP dev)

**Autenticazione:** email+password via GoTrue, JWT Supabase. Service-to-service con `X-Agent-Secret`. Ban immediato revoca refresh_tokens + delete sessions.

**Conferma email:** flusso **solo via codice OTP 6 cifre**. Template dark in `frontend/public/email-templates/confirmation.html`. GoTrue fetcha via `http://host.docker.internal:3000/email-templates/confirmation.html`.

---

## 2. Trial 14 giorni — `FATTO`

**Schema DB:**
- `plans.slug` esistenti: `free`, `starter`, `professional`, `enterprise`
- `subscriptions`: oltre ai campi standard Stripe, include `trial_reminder_3d_sent_at`, `trial_reminder_1d_sent_at`
- Trigger `public.handle_new_user()` (seed.sql + migration 018) inserisce `subscription` trialing Professional 14gg all'INSERT su `auth.users`

**Logica scadenza (lazy, nessun cron):**
- `backend/src/services/plan_limits.py` → se `status='trialing' AND current_period_end <= now()` → UPDATE a `plan='free', status='active'`
- Piano `free` ha tutti i limiti a 0 → hard block su tutte le API
- Cache Redis `plan:<user_id>` TTL 5min invalidata al cambio

**Email reminder:**
- `backend/src/services/trial_reminders.py` — reminder 3gg e 1gg
- Background task asyncio tick 1h in `backend/src/main.py`
- Template in `backend/templates/emails/trial-reminder-{3d,1d}.html`
- Aruba SMTP in `.env` (`SMTP_HOST=smtps.aruba.it`, `SMTP_PORT=465`, `admin@agentengineering.it` / `Ag3nt!2026`)

**UI:**
- `frontend/src/components/layout/TrialBanner.tsx` — countdown amber → rose
- `frontend/src/app/(dashboard)/settings/billing/BillingClient.tsx` — 3 plan cards
- `frontend/src/app/(admin)/admin/page.tsx` — pill "trial (N g)" con tooltip

---

## 3. Stripe Billing — `FATTO` (sotto-task 1)

**Cosa c'è:**
- SDK Python `stripe 15.0.1`
- `backend/src/services/billing.py` — `create_checkout_session()`, `handle_stripe_webhook()`
- `backend/src/api/billing.py` — `POST /billing/checkout`, `POST /billing/webhook`
- `frontend/src/app/(dashboard)/settings/billing/_components/BillingClient.tsx`
- `frontend/src/app/page.tsx` sezione "Pagamenti sicuri"

**Fix API 2026-03-25.dahlia:**
- `current_period_start/end` letti da `SubscriptionItem` (non più root Subscription)
- `invoice.subscription` rimpiazzato da `invoice.parent.subscription_details.subscription` via helper `_extract_subscription_id()`
- Legacy pattern `stripe.api_key`, `stripe.checkout.Session.create()`, `stripe.Webhook.construct_event()` ancora ok

**Env richieste:**
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Setup manuale ancora da fare da utente:**
1. Creare 3 Product+Price su Stripe (Starter €49, Pro €149, Enterprise €399, ricorrenti mensili EUR)
2. `UPDATE plans SET stripe_price_id = 'price_...' WHERE slug IN (...)`
3. `stripe listen --forward-to localhost:8100/api/v1/billing/webhook`, copiare `whsec_...` in `.env`

**Sotto-task NON fatte:**
- Customer Portal (upgrade/downgrade/cancel)
- Proration mid-period
- Fattura elettronica italiana SdI
- Stripe Tax

---

## 4. RBAC staff/collaborator — `FATTO`

- Migration 017: enum `user_role` include `'collaborator'`
- Backend: `require_staff` (admin+collaborator, read), `require_admin` (mutation critiche)
- Frontend: tab Staff in `/admin`, modali promote/edit role
- Collaborator può: overview, gestire utenti non-critical, reset password, view staff
- Admin-only: delete user, change plan, ban user, promote/demote

---

## 5. Banner AI key + template AI — `FATTO`

- `frontend/src/components/layout/AIKeyBanner.tsx` — dismissibile 24h via localStorage
- `frontend/src/hooks/useAgentStatus.ts` — hook condiviso
- Entry point AI nascosti quando `!agentStatus.active`: "Genera con AI", "Migliora", "Traduci", ComplianceBanner
- Backend template AI operativi: `/templates/generate`, `/improve`, `/compliance-check`, `/translate`

---

## 6. Modello di business crediti AI — `DECISO, DA-IMPLEMENTARE`

### 6.1 Principio di design: routing silente

**L'utente non vede mai i modelli.** Un credito è un credito. Il backend sceglie il modello Claude ottimale per ogni operazione, l'utente paga solo in crediti. Questa è la decisione architetturale centrale — tutte le UI, docs, email non menzionano mai "Opus", "Sonnet", "Haiku".

Linguaggio soft per comunicare all'utente i costi maggiorati (tooltip / descrizioni operazioni):
- Operazioni veloci: nessuna indicazione
- Operazioni Sonnet: nessuna indicazione (default)
- Operazioni Opus: frase tipo **"analisi approfondita"** o **"ragionamento avanzato"**

Esempio tooltip: "Pianifica campagna — 5 crediti (ragionamento avanzato)". L'utente capisce "ok, pesa di più perché è qualcosa di elaborato", senza sapere che sotto c'è Opus.

### 6.2 Modelli Claude usati

Costanti in `backend/src/services/ai_models.py` (nuovo file da creare):

```python
MODELS = {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6-20251108",
    "opus": "claude-opus-4-5",
}
```

Scelta deliberata `opus-4-5` stabile invece di `opus-4-7` latest: produzione vuole battle-tested.

### 6.3 Routing operazione → modello

| Operazione | Modello | Motivazione |
|-----------|---------|-------------|
| Chat turn standard | Sonnet | Reasoning medio sufficiente, bilanciato |
| Chat turn con tool-use | Sonnet | Default, operazioni semplici |
| **Chat turn con intent "pianifica campagna"** | **Opus** | Ragionamento strategico multi-step |
| Template generate | Sonnet | Copy marketing, Sonnet eccellente |
| Template improve (3 varianti) | Sonnet | Creatività stilistica base |
| **Template compliance check** | **Opus** | Ragionamento legale/normativo fine |
| Template translate | Haiku | Task strutturato, Haiku 1/15 costo Opus |
| Personalize message (per destinatario) | Haiku | Alto volume, variazione su template |
| Batch bulk personalize | Haiku | Come sopra, volumi maggiori |
| **Planner campagna** (nuovo endpoint Task B) | **Opus** | Strategia: analizza contatti, segmenta, decide timing |

**Detection "chat planning intent"**: regex deterministica sul prompt utente:
```
\b(campagn[ae]|planner|strateg|segment|pianific|progett)\b
```
Falso positivo = paga 3 crediti invece di 1-2, irrilevante. Falso negativo = usa Sonnet, gestisce bene comunque. Niente LLM classifier separato.

### 6.4 Tariffario crediti per operazione

| Operazione | Crediti | (Modello invisibile) |
|-----------|:-------:|---------------------|
| Chat turn standard | 1.0 | Sonnet |
| Chat turn con tool-use | 2.0 | Sonnet |
| Chat turn con "pianificazione" | 3.0 | Opus |
| Template generate | 2.0 | Sonnet |
| Template improve (3 varianti) | 3.0 | Sonnet |
| Template compliance check | 3.0 | Opus |
| Template translate | 1.0 | Haiku |
| Personalize message campagna | 0.5 | Haiku |
| Batch bulk personalize | 0.5/msg | Haiku |
| Planner campagna (nuovo endpoint) | 5.0 | Opus |

Ratio: 1 credit ≈ $0.026 costo reale medio (mix pesato Sonnet+Opus+Haiku). Margini protetti.

### 6.5 Crediti mensili per piano — RICALIBRATI

| Slug | ai_credits_month | Stima costo Anthropic | Note |
|------|-----------------:|---------------------:|------|
| free | 0 | $0 | Nessuna AI |
| starter | 0 | $0 | AI solo via BYOK |
| professional | **200** | ~$5.2 | Ridotto da 250 per copertura Opus |
| enterprise | **1.500** | ~$52 | Ridotto da 2.000 per copertura Opus |

**Strada scelta**: prezzi piano **invariati** (€49/149/399), crediti ridotti a 200/1.500 per compensare il mix con Opus. Margine ampio su Pro ($144 lordo). Margine buono su Enterprise ($347 lordo) anche con uso intenso Opus.

### 6.6 Disponibilità feature AI per piano

| Feature | Free | Starter | Professional | Enterprise |
|---------|:---:|:---:|:---:|:---:|
| Template AI (generate/improve/translate/compliance) | ❌ | BYOK only | ✅ system | ✅ system |
| Chat agent | ❌ | BYOK only | ✅ system | ✅ system |
| Personalize per-message in campagna | ❌ | ❌ | ✅ system | ✅ system |
| Batch bulk personalize (1000+) | ❌ | ❌ | ❌ | ✅ system |
| BYOK allowed | ❌ | ✅ | ✅ | ✅ |

Starter senza BYOK → AI totalmente invisibile (banner AIKeyBanner invita a configurare).

### 6.7 Logica gate (ordine esecuzione per ogni chiamata AI)

1. **Feature per piano (6.6)**: se piano non include la feature → 403 "non disponibile"
2. **Resolve key source**:
   - Se user ha `ai_config.encrypted_api_key` → BYOK, `source="byok"`, skip credit check, rate-limit soft (60 req/min)
   - Altrimenti se piano include feature + `system_config.default_anthropic_api_key` settata → `source="system_key"`, check credits
   - Altrimenti 402 "Attiva AI"
3. **Resolve modello** (solo se `source="system_key"`): `resolve_model_for_operation(operation, context)` ritorna haiku/sonnet/opus
4. **Credit check (solo system_key)**: `consume_credits()` cerca crediti prima dal piano, poi da top-up; se insufficienti → 402 "Crediti esauriti" + CTA upgrade/top-up
5. **Esegui call Claude** con il modello risolto
6. **Log ledger** `ai_usage_ledger` (sempre, anche BYOK, per analytics)
7. **Increment `ai_credits_used`** (solo system_key, rispettando priorità piano-first, topup-fallback)
8. **Warning 80%** email + banner (idempotente via flag subscriptions)

### 6.8 Schema DB (migration 020)

```sql
-- Colonna budget per piano
ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS ai_credits_month integer NOT NULL DEFAULT 0;

UPDATE plans SET ai_credits_month = 0    WHERE slug = 'free';
UPDATE plans SET ai_credits_month = 0    WHERE slug = 'starter';
UPDATE plans SET ai_credits_month = 200  WHERE slug = 'professional';
UPDATE plans SET ai_credits_month = 1500 WHERE slug = 'enterprise';

-- Contatore mensile user
ALTER TABLE usage_counters
    ADD COLUMN IF NOT EXISTS ai_credits_used numeric(10,2) NOT NULL DEFAULT 0;

-- Ledger per audit + dashboard admin
CREATE TABLE IF NOT EXISTS ai_usage_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation text NOT NULL,
    model text NOT NULL,                 -- 'haiku' | 'sonnet' | 'opus'
    source text NOT NULL,                -- 'system_key' | 'byok'
    credits numeric(6,2) NOT NULL,
    estimated_cost_usd numeric(8,4) NOT NULL DEFAULT 0,
    tokens_in integer NOT NULL DEFAULT 0,
    tokens_out integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_user_created ON ai_usage_ledger (user_id, created_at DESC);
CREATE INDEX idx_ledger_created ON ai_usage_ledger (created_at DESC);

-- Idempotenza warning
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS ai_credits_80_warning_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS ai_credits_100_reached_at timestamptz;
```

---

## 7. Top-up crediti — `DECISO, DA-IMPLEMENTARE`

### 7.1 Modello

**Pacchetti pre-definiti one-shot** (scelto Modello A). Niente auto-recharge, niente pay-per-use. User paga via Stripe Checkout mode=payment (non subscription), crediti aggiunti al saldo top-up.

### 7.2 Pacchetti

| Pack | Crediti | Prezzo | € / credit | Margine ~ | Badge |
|------|--------:|-------:|-----------:|----------:|-------|
| Small | 100 | €15 | €0.15 | 5× costo | — |
| Medium | 500 | €59 | €0.118 | 4× costo | **Più venduto** |
| Large | 2.000 | €199 | €0.10 | 3.3× costo | **Miglior prezzo** |
| XL | 10.000 | €799 | €0.08 | 2.7× costo | — |

Più grande = sconto per credit. Incentivo acquisto volume.

Nella dashboard user, layout 4 card con Medium evidenziato e badge.

### 7.3 Validità

**12 mesi dall'ultimo acquisto.** Ogni nuovo acquisto top-up refresha la scadenza. Coerente con standard OpenAI/altri SaaS.

Campo DB `topup_expires_at` ricalcolato ad ogni acquisto: `GREATEST(current_expires, now() + interval '12 months')` — questo protegge user che ha già un top-up attivo (non accorcia la scadenza).

### 7.4 Accessibilità

Solo piani **paganti** (Starter, Pro, Enterprise). Free e trial expired **non possono** fare top-up — devono prima scegliere un piano.

Razionale: Free è un tier di conversione, non un prodotto. Se vuole più AI → upgrade, non acquisto singolo.

### 7.5 BYOK

Se user ha BYOK configurato → dashboard top-up mostra messaggio informativo: *"Stai usando la tua API key Claude. I top-up non sono necessari."* + pulsanti acquisto disabilitati.

Razionale: user BYOK paga Anthropic direttamente, Wamply non conteggia crediti sulle sue chiamate. Top-up inutile.

### 7.6 Consumo crediti — logica piano-first

```python
def consume_credits(user_id, cost):
    plan_remaining = get_plan_credits_remaining(user_id)
    topup_remaining = get_topup_credits_remaining(user_id)

    if plan_remaining + topup_remaining < cost:
        raise InsufficientCredits()

    if plan_remaining >= cost:
        # Caso 1: bastano i crediti del piano
        increment_plan_used(user_id, cost)
        return {"from_plan": cost, "from_topup": 0}

    # Caso 2: piano esaurito (o quasi), attinge anche dal top-up
    from_plan = plan_remaining
    from_topup = cost - from_plan
    increment_plan_used(user_id, from_plan)
    decrement_topup(user_id, from_topup)
    return {"from_plan": from_plan, "from_topup": from_topup}
```

**Priorità piano-first** protegge l'investimento dell'utente: prima consuma crediti "gratis" (già pagati col piano), poi attinge al top-up.

### 7.7 Schema DB (migration 021)

```sql
-- Saldo top-up per user
CREATE TABLE IF NOT EXISTS ai_credit_balance (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    topup_credits numeric(10,2) NOT NULL DEFAULT 0,
    topup_expires_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audit acquisti
CREATE TABLE IF NOT EXISTS ai_credit_purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_slug text NOT NULL,               -- 'small' | 'medium' | 'large' | 'xl'
    credits_purchased integer NOT NULL,
    amount_cents integer NOT NULL,
    stripe_payment_intent_id text,
    stripe_checkout_session_id text,
    status text NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed' | 'refunded'
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);
CREATE INDEX idx_purchases_user ON ai_credit_purchases (user_id, created_at DESC);
```

### 7.8 Stripe setup

**4 nuovi Price su dashboard Stripe** (mode=one_time, non recurring):
- `price_topup_small` — €15
- `price_topup_medium` — €59
- `price_topup_large` — €199
- `price_topup_xl` — €799

Env vars aggiuntive o tabella `stripe_topup_prices` nel DB. Default: env vars per flessibilità dev vs prod.

**Nuovo endpoint:** `POST /api/v1/billing/topup/checkout` — body `{pack_slug}` → crea Checkout mode=payment con `metadata.type="topup"` e `metadata.pack_slug` → ritorna `{checkout_url}`.

**Webhook handler aggiornato:** `checkout.session.completed` legge `metadata.type`. Se `"topup"` → inserisce row `ai_credit_purchases`, UPSERT `ai_credit_balance.topup_credits += pack_credits`, aggiorna `topup_expires_at`.

### 7.9 Refund policy

**Top-up non rimborsabili** dopo utilizzo parziale. Diritto di recesso D.Lgs 206/2005 art. 59 lett. m: contenuti digitali che iniziano esecuzione dopo consenso esplicito non hanno recesso se iniziato. User accetta al checkout (clausola esplicita su Stripe Checkout).

Se zero consumo → refund entro 14gg via Stripe manuale da admin dashboard (processo manuale). Reimborso segna `status='refunded'`, decrementa `topup_credits`.

### 7.10 Admin dashboard — separazione revenue

Nuovo tab `/admin` → "AI Revenue" con:
- KPI "Subscription revenue" (MRR da piani)
- KPI "Top-up revenue" (totale acquisti pack ultimo mese)
- Conteggio totale top-up per pack
- Top 10 utenti per spesa top-up (utile per identificare heavy user a cui suggerire upgrade Enterprise)
- Alert: user con 3+ acquisti in 30gg → badge "Suggerire upgrade"

---

## 8. UX pagina crediti — `DECISO, DA-IMPLEMENTARE`

Nuova pagina `/settings/credits` in dashboard user.

### 8.1 Layout (dall'alto in basso)

**Card saldo (hero):**
- Numero grande centrato: crediti totali disponibili (plan + topup)
- Sub: "Dal piano Professional"
- Barra progress duale: piano (blu) + top-up (teal)
- Dettaglio: "147 dal piano (su 200) + 100 top-up (scadono 15 aprile 2027)"
- Stato colori:
  - Normale: verde/teal
  - 80%+ plan consumato: amber
  - Plan esaurito ma top-up presente: "Stai usando crediti top-up" teal
  - Totale esaurito: rose

**Sezione "Ricarica ora":**
- Grid 4 card (Small/Medium/Large/XL)
- Card Medium con badge "Più venduto", Large con "Miglior prezzo"
- Per ogni card: crediti, prezzo, € / credito, bullet points ("~50 messaggi personalizzati", "~25 template generati"), button "Acquista"
- Click → apre Stripe Checkout in nuovo tab
- Se user BYOK: banner sopra griglia + button disabilitati con tooltip "Stai usando la tua API key"
- Se user Free: cards nascoste, messaggio "Scegli un piano per sbloccare l'AI" + CTA billing

**Sezione "Consumo questo mese":**
- Breakdown per operazione con icona e conteggio crediti
- Toggle "Ultimi 30 giorni / 90 giorni / anno"
- Mini bar chart mensile (consumo per giorno) per trend

**Sezione "Storico top-up":**
- Tabella: data, pack, prezzo, crediti rimanenti, scadenza, status
- Link "Scarica fattura" (via Stripe receipt_url)

**Sezione FAQ inline (collassabile):**
1. Cosa sono i crediti?
2. Come vengono consumati?
3. Cosa succede se finisco?
4. Posso rimborsare un top-up?
5. Devo configurare qualcosa?

### 8.2 Integrazione con banner esistenti

`AIKeyBanner` (già presente per chi non ha chiave) resta invariato.

Nuovo comportamento nel `TrialBanner` / `AIKeyBanner` quando crediti **piano** sono ≥80%:
- Banner arancione "Hai usato 160/200 crediti AI" + CTA "Ricarica crediti" → `/settings/credits#ricarica`

Quando crediti totali (piano + topup) sono a 0:
- Banner rosso "Crediti AI esauriti" + doppio CTA: "Ricarica" + "Passa a Enterprise"

### 8.3 Navigazione

Nuova voce sidebar "Crediti AI" con icona (es. icona moneta/sparkle) — visibile solo se user ha piano pagante. Per Free nascosta.

Alternativa: sub-nav dentro `/settings`. Vado con **voce sidebar dedicata** per visibilità (pattern OpenAI/Anthropic console).

---

## 9. Chat agent — stato reale `PARZIALE`

**Cosa funziona:**
- Proxy Next → agent via `frontend/src/app/api/agent/chat/route.ts`
- `agent/src/api/endpoints/chat.py` endpoint `/chat`
- `agent/src/agents/chat_handler.py` — `handle_chat()` completo:
  - Loop Claude tool_use (call + se tool_use, esegui + summary call)
  - 25 tool in `execute_tool()`
  - `mock_llm` env per dev
  - Error handling singoli tool

**Cosa è rotto (Task 3 sistemerà tutto):**
1. **API key statica**: usa `settings.anthropic_api_key` env. Ignora BYOK e system_config DB.
2. **Memoria assente**: `SupabaseMemory`/`RedisMemory` passate args ma `handle_chat` non le usa. Stateless.
3. **No plan gate**: utenti free/starter senza BYOK usano se env settata.
4. **No credit accounting**.
5. **Modello fisso Sonnet**: non usa routing Opus per planning intent.

**Task 3 cosa deve fare:**
- `_resolve_api_key(user_id, db)` con priorità BYOK → system_config → errore
- `_get_client(api_key)` per-user
- `_resolve_model(prompt)` con regex detection su "pianifica campagna" → Opus
- Pre-flight: check feature `agent_ai`, check credits
- Post-flight: scrive `ai_usage_ledger`, increment `ai_credits_used`, warning 80%
- Memoria Redis: ultimi 10 turn chiave `chat:history:<user_id>` TTL 24h
- Encryption: importare `decrypt` da `agent/src/utils/encryption.py`

---

## 10. Home page copy — `DA-AGGIORNARE`

### 10.1 Cosa c'è

- `frontend/src/app/page.tsx` sezione "Pagamenti sicuri" con logo Stripe
- 4 plan cards (Free Trial, Starter, Pro, Enterprise) con banner-image

### 10.2 Cosa aggiornare

**Copy per piano:**

| Piano | Headline | Sub |
|-------|----------|-----|
| Free Trial | 14 giorni gratis | Tutte le funzionalità Professional, nessuna carta |
| Starter €49 | Perfetto per iniziare | Porta la tua API key Claude — zero costi AI aggiuntivi |
| Professional €149 | Il più scelto | 200 crediti AI/mese inclusi — personalizzazione su ogni messaggio |
| Enterprise €399 | Per chi scala | 1.500 crediti AI/mese + BYOK illimitato + white label |

**Nuova riga sotto ogni card** ("include AI") per trasparenza:
- Free: "—"
- Starter: "AI opzionale con tua API key"
- Pro: "200 crediti AI/mese" + tooltip "~100 messaggi personalizzati, ~40 template"
- Enterprise: "1.500 crediti AI/mese" + tooltip

**Strip sotto hero:** "🎁 14 giorni gratis · 💳 Nessuna carta · 🔐 Pagamenti Stripe · 🤖 Powered by Claude AI"

**Nuova sezione "AI Auto-Selection"** (opzionale, tra features e pricing):
- Headline: "Wamply sceglie il modello AI migliore per ogni operazione"
- Sub: "Ragionamento avanzato dove serve, velocità dove conta. Tu pensi al risultato, noi alla tecnologia."
- 3 icone esempio: velocità (Haiku-like, invisible), creatività (Sonnet-like, invisible), strategia (Opus-like, invisible) — sempre senza nominare i modelli

**FAQ section** con 3 domande in accordion:
1. "Cosa sono i crediti AI?" — spiegazione + link al dettaglio operazioni
2. "Posso usare la mia chiave Claude (BYOK)?" — sì, da Starter in su, senza limiti da parte Wamply
3. "Cosa succede se finisco i crediti?" — blocco AI fino al rinnovo mensile, oppure ricarica con pacchetti top-up

**Banner image update** (se contengono testo hardcoded):
- `wamply-professional-banner.png`: "200 crediti AI"
- `wamply-enterprise-banner.png`: "1.500 crediti AI"

---

## 11. Piano implementazione — task sequenziali

Ordine aggiornato con il top-up e la nuova pagina crediti:

**Task 1 — Schema crediti (migration 020)** — DA-FARE
- Colonna `ai_credits_month` su plans + seed
- Colonna `ai_credits_used` su usage_counters
- Tabella `ai_usage_ledger`
- Campi idempotenza warning su subscriptions
- Testabile: DB aggiornato, nessuna logica cambiata

**Task 2 — Credit service + routing backend** — DA-FARE
- `backend/src/services/ai_models.py` — costanti modelli
- `backend/src/services/ai_credits.py` — `resolve_api_key`, `resolve_model_for_operation`, `consume_credits` (piano-first stub topup), `commit_credits`
- Wrapping dei 4 endpoint template in `ai_template.py` (generate/improve/compliance/translate)
- Aggiornamento `/settings/agent-status` con `ai_credits_remaining`, `ai_credits_used`, `ai_credits_limit`, `source`
- Testabile: template AI bloccano su exhausted, scrivono ledger, usano modello corretto (sonnet per improve, opus per compliance, haiku per translate)

**Task 3 — Chat agent credit-aware** — DA-FARE
- `_resolve_api_key`, `_get_client` per-user
- Regex intent detection "campagna" → Opus
- Pre/post flight credit accounting
- Memoria Redis 10 turn
- Gate feature `agent_ai`
- Testabile: chat funziona BYOK+system_key, memory persistente, model routing

**Task 4 — Schema top-up (migration 021) + endpoint** — DA-FARE
- `ai_credit_balance`, `ai_credit_purchases`
- Endpoint `POST /billing/topup/checkout`
- Webhook handler esteso per `metadata.type="topup"`
- 4 Stripe Prices da creare manualmente + env vars
- Estensione `consume_credits` con logica piano-first topup-fallback
- Testabile: acquisto completato aggiunge credits, webhook sincronizza

**Task 5 — UI pagina crediti** — DA-FARE
- `frontend/src/app/(dashboard)/settings/credits/page.tsx`
- Componenti: `CreditsBalanceCard`, `TopupPackGrid`, `UsageBreakdown`, `PurchaseHistory`, `CreditsFAQ`
- Nuova voce sidebar "Crediti AI"
- Aggiornamenti `TrialBanner`/`AIKeyBanner` con CTA "Ricarica crediti"
- Testabile: user vede saldo, compra pack, vede storico

**Task 6 — Email warning 80% + reminder esaurimento** — DA-FARE
- Template `backend/templates/emails/ai-credits-warning-80.html`
- Template `backend/templates/emails/ai-credits-exhausted.html`
- Estensione background task o nuovo loop
- Testabile: a 80% arriva email, a 100% arriva email

**Task 7 — AI nelle campagne (Task B)** — DA-FARE
- Nuovo endpoint `POST /campaigns/preview-personalization` (Haiku, 0.5 credit/msg preview)
- Nuovo endpoint `POST /campaigns/planner` (Opus, 5 credits) — dato obiettivo + contatti, propone segmento+template+timing
- Wizard `/campaigns/new` con step "AI Planning"
- Dialog preview personalizzazione (5 contatti sample)

**Task 8 — Admin dashboard AI + Revenue** — DA-FARE
- Tab `/admin` "AI Costs" — aggregazione ledger (cost USD, user top10, chart timeline)
- Tab `/admin` "AI Revenue" — subscription vs top-up revenue, top-spender
- Filtri data/source/model
- Alert heavy top-up (3+ in 30gg)

**Task 9 — Home page copy update** — DA-FARE
- Ricalibrazione plan cards con "200 crediti"/"1.500 crediti"
- Nuova sezione "AI Auto-Selection"
- FAQ con 3 domande su crediti
- Banner image refresh (contenuto grafico, non codice)

**Task 10 — Stripe sotto-task 2** (futura) — Customer Portal + proration + cancel
**Task 11 — Stripe sotto-task 3** (futura) — SdI italiana + Stripe Tax

---

## 12. Decisioni congelate (non rinegoziare)

- Trial 14gg → Free (non Starter) all'expiry, hard block
- Piano `free` come row DB con limiti 0
- Email conferma solo OTP 6 cifre, no link
- Staff role = collaborator (admin-lite)
- Stripe legacy pattern ok
- Dahlia API: `current_period` su SubscriptionItem, `invoice.parent.subscription_details`
- Routing modelli silente — utente mai vede "Sonnet/Opus/Haiku", solo crediti
- Top-up: pacchetti A, 12 mesi validità, solo paying, no BYOK, non-rimborsabili se consumati
- Crediti ricalibrati: Pro 200, Enterprise 1.500
- Tariffario 6.4 (compliance=3c Opus, translate=1c Haiku, planner=5c Opus)
- AIKeyBanner dismissible 24h localStorage

## 13. Cose da non dimenticare

- **Reset mensile contatori**: `usage_counters` usa `period_start = CURRENT_DATE`. Nuova row per nuovo mese → `ai_credits_used` riparte da 0 naturalmente. **Ma** i flag `ai_credits_80_warning_sent_at` e `ai_credits_100_reached_at` in `subscriptions` vanno resettati esplicitamente dal credit service quando rileva transizione a nuovo periodo.
- **Top-up NON si resetta mensilmente**: è saldo indipendente, valido 12 mesi.
- **Rate limit BYOK**: 60 req/min chiave Redis `ratelimit:ai:<user_id>`.
- **BYOK validation**: default nessuna validazione upfront. Errore solo dalla prima chiamata reale. Può essere aggiunto dopo se user reporterà problemi.
- **CTA 402 messaggio**: template: *"Crediti esauriti. Ricarica con un pacchetto oppure [passa a Enterprise]. Il piano si rinnova il [data]."*
- **Detection intent "campagna"** in chat: regex deterministica in 6.3, semplice e gratuita. Se servirà affinamento, passare a classifier LLM separato.
- **Linguaggio UX Opus**: "analisi approfondita" / "ragionamento avanzato". Non usare mai "Opus", "modello avanzato", "AI premium" (quest'ultimo confonde con concetti di piano).

## 14. File chiave da leggere per orientarsi

- `README.md` — architettura + setup Stripe completo
- `docs/email-confirmation-fix.md` — contesto storico email (superato)
- `supabase/migrations/*.sql` — migration applicate (fino a 019)
- `supabase/seed.sql` — trigger `handle_new_user` con trial
- `backend/src/services/plan_limits.py` — entry point enforcement piano
- `backend/src/services/billing.py` — Stripe integration
- `agent/src/agents/chat_handler.py` — chat handler (con 5 bug noti)
- `frontend/src/components/layout/TrialBanner.tsx` + `AIKeyBanner.tsx` — pattern banner globale
- `frontend/src/app/(dashboard)/settings/billing/_components/BillingClient.tsx` — pattern plan cards Stripe (utile per TopupPackGrid)

## 15. Credenziali dev

- Admin: `admin@wcm.local` / `Admin123!`
- User1 (Starter): `user1@test.local` / `User123!`
- User2 (Pro): `user2@test.local` / `User123!`
- Break-glass in `README.md`
- `.env` ha vere credenziali Aruba SMTP + Stripe test — non committare

---

*Fine documento.* Quando apri una nuova sessione Claude Code, fai leggere questo file come primo step. Poi `riprendi da Task N`. Ogni modifica significativa va riflessa qui per non perdere il filo tra sessioni.
