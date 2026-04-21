# Guida al test end-to-end — Wamply

> Versione: 2026-04-21
> Scope: verificare Task 1-10 del piano crediti AI + Stripe implementati finora.
> Obiettivo: esercitare ogni flusso utente e admin dal vivo con Stripe test mode e una chiave Claude reale o mock.

---

## Indice

1. [Fase 0 — Avvio stack](#fase-0--avvio-stack)
2. [Fase 1 — Setup prerequisiti](#fase-1--setup-prerequisiti-stripe-e-anthropic)
3. [Fase 2 — Test flussi](#fase-2--test-flussi-ordine-consigliato)
4. [Troubleshooting](#troubleshooting)
5. [Reset ambiente](#reset-ambiente)
6. [Note operative](#note-operative)

---

## Fase 0 — Avvio stack

### 0.1 Verifica stato container

```bash
cd c:/Users/GiuseppeZileni/Git/wamply
docker ps --filter "name=wcm-" --format "{{.Names}}\t{{.Status}}"
```

Ti servono **tutti questi** Up e healthy:

- `wcm-frontend` (3000)
- `wcm-backend` (8200)
- `wcm-agent` (8000)
- `wcm-supabase-kong` (8100)
- `wcm-supabase-auth` (9999)
- `wcm-supabase-rest` (3001)
- `wcm-supabase-db` (5432)
- `wcm-redis` (6379)
- `wcm-mailhog` (8025 UI, 1025 SMTP — per dev)

### 0.2 Avvio completo

Se mancano container:

```bash
docker compose up -d
```

Aspetta ~30 secondi, poi riverifica con `docker ps`.

**Al primo avvio** il frontend fa `npm install` (1-2 minuti). Controlla con:

```bash
docker logs wcm-frontend --tail 30
```

Quando vedi `✓ Ready in Xs` e `Local: http://localhost:3000`, è pronto.

### 0.3 Health check rapido

```bash
curl -s http://localhost:8200/health
curl -s http://localhost:8100/api/v1/health
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://localhost:3000
```

Attesi: `{"status":"ok"...}` sui primi due, `307` o `200` sul frontend.

---

## Fase 1 — Setup prerequisiti Stripe e Anthropic

### 1.1 Variabili ambiente base

Verifica `.env` alla radice del progetto:

```bash
grep -E "^(STRIPE_|ANTHROPIC_API_KEY|SMTP_)" c:/Users/GiuseppeZileni/Git/wamply/.env
```

I placeholder tipo `sk_test_xxxxx` **non vanno bene** — vanno sostituiti con chiavi vere.

### 1.2 Product + Price su Stripe Dashboard (test mode)

Vai su [dashboard.stripe.com](https://dashboard.stripe.com) → toggle in alto a destra su **Test mode** → **Products → Add product**.

**3 abbonamenti ricorrenti (recurring, monthly, EUR):**

| Piano | Nome prodotto | Prezzo |
|-------|---------------|--------|
| Starter | Wamply Starter | €49 |
| Professional | Wamply Professional | €149 |
| Enterprise | Wamply Enterprise | €399 |

**4 pacchetti top-up (one-time, mode=payment, EUR):**

| Pack | Nome prodotto | Prezzo |
|------|---------------|--------|
| Small | Wamply 100 crediti AI | €15 |
| Medium | Wamply 500 crediti AI | €59 |
| Large | Wamply 2.000 crediti AI | €199 |
| XL | Wamply 10.000 crediti AI | €799 |

**Importante:** i top-up devono essere **one-time**, NON recurring. Altrimenti Stripe crea una subscription mensile per il pacchetto.

Dopo aver creato ogni Price, copia l'id `price_...` e aggiornali in `.env`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
STRIPE_PRICE_TOPUP_SMALL=price_...
STRIPE_PRICE_TOPUP_MEDIUM=price_...
STRIPE_PRICE_TOPUP_LARGE=price_...
STRIPE_PRICE_TOPUP_XL=price_...
```

### 1.3 Sincronizza `stripe_price_id` in DB per i 3 abbonamenti

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres <<'SQL'
UPDATE plans SET stripe_price_id = 'price_...STARTER' WHERE slug = 'starter';
UPDATE plans SET stripe_price_id = 'price_...PRO'     WHERE slug = 'professional';
UPDATE plans SET stripe_price_id = 'price_...ENT'     WHERE slug = 'enterprise';
SQL
```

(sostituisci con gli id reali copiati da Stripe).

Verifica:

```bash
docker exec -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres -c \
  "SELECT slug, stripe_price_id FROM plans ORDER BY price_cents;"
```

### 1.4 Customer Portal su Stripe

Dashboard Stripe → **Settings → Billing → Customer portal** → **Activate**.

Configurazione consigliata:

- ✅ **Invoice history**
- ✅ **Update payment method**
- ✅ **Cancel subscriptions** → scegli **"At end of billing period"**
- ✅ **Switch plans** → seleziona i 3 Product Starter/Professional/Enterprise, abilita **Prorations (create_prorations)**
- ✅ **Update billing address** + **Tax ID**
- ❌ **Update customer info → email** (identity utente, va gestita da Wamply)
- ❌ **Promotion codes** (a meno che tu non faccia campagne sconto)

Salva. Questa configurazione è **separata tra test e live** — va rifatta in produzione.

### 1.5 Stripe CLI per webhook

Installa la CLI se non ce l'hai:

```bash
# Windows
winget install --id Stripe.StripeCLI

# macOS
brew install stripe/stripe-cli/stripe
```

Autentica:

```bash
stripe login
```

Avvia il forward in un **terminale separato** (lascia acceso per tutta la sessione di test):

```bash
stripe listen --forward-to localhost:8100/api/v1/billing/webhook
```

Copia il `whsec_...` stampato, mettilo in `.env` come `STRIPE_WEBHOOK_SECRET`, poi:

```bash
docker compose restart backend
```

### 1.6 Anthropic API Key

Serve una chiave Claude reale, altrimenti l'AI va in fallback mock (testi sostitutivi ma l'accounting crediti funziona).

Due modi:

**A — System key** (amministratore configura una volta, tutti gli utenti paganti la usano):

1. Apri http://localhost:3000
2. Login come admin (`admin@wcm.local` / `Admin123!`)
3. `/admin` → **Settings** (o endpoint diretto `POST /settings/system` con payload `{"default_anthropic_api_key": "sk-ant-..."}`)
4. Salva

**B — BYOK** (ogni user la configura nella propria dashboard):

1. Login come user → `/settings/ai`
2. Incolla `sk-ant-...` nel campo API Key
3. Salva

**Per i test usa A**: così utenti Pro/Enterprise consumano crediti system, utenti BYOK hanno zero-cost analytics.

### 1.7 Verifica finale setup

```bash
docker exec wcm-backend env | grep -E "STRIPE_|SMTP_" | sort
```

Tutto popolato, nessun `xxxxx`. Poi:

```bash
curl -s http://localhost:8200/billing/topup/packs
```

Deve ritornare JSON con 4 packs.

---

## Fase 2 — Test flussi (ordine consigliato)

### 2.1 Trial nuovo utente (5 min)

1. Apri browser in **incognito** (evita sessioni cached)
2. Vai su `/register`
3. Usa email nuova mai vista (es. `test1@gmail.com` o simile — serve email reale se vuoi ricevere conferma SMTP Aruba, altrimenti usa mailhog e accedi a http://localhost:8025)
4. Compila form → invio
5. Controlla email → ricevi codice OTP dal template dark Wamply
6. Inserisci codice in `/confirm-email` → atterri su `/dashboard`

**Verifica visiva:**

- In cima dashboard, banner amber **TrialBanner** "14 giorni rimanenti"
- Sidebar ha voce **Crediti AI** (perché il piano trial è Professional)

**Verifica DB:**

```bash
docker exec -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres -c "
SELECT s.status, p.slug, s.current_period_end, s.ai_credits_80_warning_sent_at
FROM subscriptions s JOIN plans p ON p.id = s.plan_id
WHERE s.user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
"
```

Attesi: `trialing`, `professional`, scadenza tra 14gg, flag warning NULL.

### 2.2 Template AI — Generate (5 min)

1. Dashboard → `/templates`
2. Click pulsante **"Genera con AI"** (visibile solo se AI attiva)
3. Prompt: `Promemoria appuntamento dal barbiere in italiano`
4. Invio → attendi generazione
5. Template creato in stato `draft`

**Verifica ledger:**

```bash
docker exec -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres -c "
SELECT operation, model, source, credits, tokens_in, tokens_out
FROM ai_usage_ledger
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com')
ORDER BY created_at DESC LIMIT 5;
"
```

Deve apparire riga `template_generate / sonnet / system_key / 2.00 / N / N`.

**Verifica saldo:**

`/settings/credits` → saldo "198 disponibili" (200 - 2). Breakdown mostra "Generazione template: 2".

### 2.3 Template AI — Improve (2 min)

1. Entra in un template esistente → `/templates/[id]`
2. Click **"Migliora"** sul corpo del messaggio
3. Claude produce 3 varianti (Sonnet, 3 crediti)
4. Accetta una delle 3 o chiudi il dialog
5. Saldo ora 195/200

### 2.4 Template AI — Compliance check (2 min)

1. Stesso template → click **"Verifica compliance"** (o banner amber se già verificato)
2. Claude Opus fa analisi approfondita (3 crediti)
3. Ritorna `{risk_level, score, issues}`
4. Ledger: `template_compliance / opus / system_key / 3.00`
5. Saldo 192/200

### 2.5 Template AI — Translate (3 min)

1. Template card → menu (…) → **"Traduci…"**
2. Dialog con selezione lingue
3. Seleziona 2 lingue diverse (es. EN + ES)
4. Conferma → Claude Haiku traduce entrambe (1 credito per lingua = 2 totali)
5. Crea 2 template draft con `source_template_id` linkato
6. Ledger: 2 righe `template_translate / haiku / system_key / 1.00`
7. Saldo 190/200

### 2.6 Chat agent (5 min)

1. Sidebar → **Agent AI** (visibile solo se active)
2. Prompt 1: `Mostra i contatti`
   - Claude Sonnet con tool_use → chiamata `list_contacts` → riepilogo
   - Ledger: `chat_turn_tool_use / sonnet / 2.00`
   - Saldo 188/200
3. Prompt 2: `Progetta una campagna promozionale per clienti Milano`
   - Regex intenta "campagn" + "progett" → Opus
   - Ledger: `chat_turn_planner / opus / 3.00`
   - Saldo 185/200
4. Prompt 3 (semplice chat): `Ciao, chi sei?`
   - No tool_use, no planner → Sonnet 1 credit
   - Ledger: `chat_turn / sonnet / 1.00`
   - Saldo 184/200
5. Prompt 4: `Riassumi le ultime 3 cose di cui abbiamo parlato`
   - L'agent deve ricordare la conversazione (Redis memory 10 turn TTL 24h)
   - Se ricorda → memoria funziona
   - Se dice "non abbiamo parlato" → bug memory

**Verifica memoria:**

```bash
docker exec wcm-redis redis-cli GET "chat:history:$(docker exec -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres -tA -c "SELECT id FROM users WHERE email='test1@gmail.com'")"
```

Deve ritornare JSON con array di turn.

### 2.7 Campagne — Preview personalization + Planner (5 min)

1. `/campaigns/new`
2. **Campaign Planner** (card indigo): click per espandere, obiettivo: `Promuovere i nostri nuovi servizi ai clienti più fedeli`
3. Click "Pianifica" → Opus ritorna segmento + template consigliato + orario + reasoning (5 crediti)
4. Ledger: `campaign_planner / opus / 5.00`
5. Seleziona un template dal dropdown (o usa "Usa questo template" dal planner)
6. **Personalization Preview**: card sotto → click "Genera anteprima"
7. 3 messaggi personalizzati per 3 contatti esempio (0.5 * 3 = 1.5 crediti)
8. Ledger: 3 righe `personalize_message / haiku / 0.50`
9. Saldo 184 - 5 - 1.5 = 177.5/200

### 2.8 Top-up acquisto (5 min)

1. `/settings/credits`
2. Grid pacchetti visibile (4 card)
3. Click **"Acquista"** su **Medium** (500 crediti / €59)
4. Stripe Checkout si apre in nuovo tab
5. Carta di test: `4242 4242 4242 4242`, scadenza `12/34`, CVC `123`, nome/indirizzo fittizi
6. Conferma pagamento
7. Redirect a `/settings/credits?topup=success`
8. Banner verde "Ricarica completata"

**Verifica webhook:**

Terminale `stripe listen` deve mostrare:

```
-> checkout.session.completed [evt_...]
<- 200
```

**Verifica DB:**

```bash
docker exec -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres -c "
SELECT topup_credits, topup_expires_at FROM ai_credit_balance
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
"
```

Attesi: 500 crediti, scadenza +365gg.

**Verifica UI:**

Ricarica `/settings/credits` → saldo totale = 177.5 (piano) + 500 (topup) = 677.5. Sezione "Storico acquisti" mostra una riga `completed`.

### 2.9 Warning 80% (10 min)

Forza consumo piano a 170/200 (85%):

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres <<'SQL'
UPDATE usage_counters
SET ai_credits_used = 170
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com')
  AND period_start = date_trunc('month', now())::date;
UPDATE subscriptions
SET ai_credits_80_warning_sent_at = NULL, ai_credits_100_reached_at = NULL
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
SQL
```

**Verifica UI:**

Ricarica dashboard → **CreditsBanner** amber appare in cima: "Hai usato 170/200 crediti AI" + CTA "Ricarica crediti".

**Forza l'invio email** (il loop gira ogni ora):

```bash
docker exec wcm-backend python -c "
import asyncio, asyncpg, os
from src.services.ai_credit_reminders import run_credit_reminders
async def t():
    pool = await asyncpg.create_pool(os.getenv('DATABASE_URL'))
    r = await run_credit_reminders(pool)
    print('Result:', r)
    await pool.close()
asyncio.run(t())
"
```

Attesi: `{'80': 1, '100': 0, 'errors': 0}`.

**Se SMTP va ad Aruba:** email arriva all'indirizzo utente.

**Se SMTP va a mailhog** (dev): apri http://localhost:8025 e cerca la mail.

### 2.10 Esaurimento 100% (3 min)

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres <<'SQL'
UPDATE usage_counters SET ai_credits_used = 210
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com')
  AND period_start = date_trunc('month', now())::date;
UPDATE ai_credit_balance SET topup_credits = 0
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
UPDATE subscriptions SET ai_credits_100_reached_at = NULL
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
SQL
```

Rilancia `run_credit_reminders` → `{'80': 0, '100': 1, 'errors': 0}` → email esaurimento rose.

**Verifica UI:**

- Dashboard: `CreditsBanner` rose "Crediti AI esauriti"
- Prova a fare template generate → risposta 402 "Crediti AI esauriti" con header `X-Suggested-Plan: enterprise`
- `/settings/credits`: saldo 0 disponibili, card hero colore rose

### 2.11 Customer Portal (5 min)

Preeq: devi avere una subscription Stripe attiva (non solo trial). Se sei ancora in trial, prima fai un Checkout abbonamento:

1. `/settings/billing` → click "Scegli questo piano" su Professional
2. Stripe Checkout → carta `4242 4242 4242 4242`
3. Redirect `?checkout=success`
4. Ora la subscription ha `stripe_subscription_id`

Ora test Portal:

1. `/settings/billing` → click **"Gestisci abbonamento"**
2. Portal Stripe si apre in nuovo tab
3. Prova **Cancel subscription** → scegli "at end of period"
4. Torna a Wamply → redirect a `/settings/billing?portal=return`
5. Banner "Modifiche registrate"
6. La card piano mostra badge amber **"Cancellazione programmata"** con data

**Verifica DB:**

```bash
docker exec -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres -c "
SELECT cancel_at_period_end, current_period_end FROM subscriptions
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
"
```

`cancel_at_period_end = t`, current_period_end tra ~1 mese.

Dal Portal puoi anche **Reactivate** (undo cancel). Test anche quello per completezza.

### 2.12 Admin dashboard — AI Costs (3 min)

1. Logout, login come admin (`admin@wcm.local` / `Admin123!`)
2. `/admin` → tab **AI Costs**
3. Verifica:
   - KPI cards: costo Anthropic USD totale, crediti consumati, chiamate, BYOK calls
   - Chart timeline: barre per giorno
   - Tabella "Per modello": Sonnet/Opus/Haiku con calls e costo
   - Tabella "Per operazione": template_generate, chat_turn_planner, ecc.
   - Top 10 utenti: `test1@gmail.com` in cima se hai consumato di più

4. Cambia filtro `7/30/90 giorni` → dati si aggiornano

### 2.13 Admin dashboard — AI Revenue (3 min)

1. Stessa pagina → tab **AI Revenue**
2. Verifica:
   - MRR totale dai seed users
   - Top-up revenue ultimi 30gg (con l'acquisto di 2.8 = €59)
   - Tabella "MRR per piano" (Starter/Pro/Enterprise con n° subs)
   - Tabella "Top-up per pacchetto" (Medium: 1 acquisto €59)
   - Sezione "Candidati upgrade" — vuota finché qualcuno non compra 3+ pacchetti

### 2.14 Home page i18n (3 min)

1. Apri browser in incognito (no session)
2. `http://localhost:3000/` → redirect automatico a `/it`
3. Verifica:
   - Hero "Amplify your WhatsApp campaigns with AI"
   - Sezione "AI al centro" con 4 card (Scrive il copy / Segmenta / Parla lingua / Impara)
   - Sezione "Come funziona" 3 step
   - Sezione "Auto-Selection" con 3 tier e footnote "Routing automatico"
   - Pricing 4 card: Free Trial, Starter, Professional (consigliato), Enterprise
   - FAQ 3 domande accordion
4. Click language switcher → passa a `/en`
5. Verifica che tutto il copy sia tradotto in inglese
6. Footer: Wamply © 2026, Stripe, Claude AI

---

## Troubleshooting

### Frontend non parte

```bash
docker logs wcm-frontend --tail 50
```

Cause comuni:

- `npm install` fallito: `docker compose down frontend && docker compose up -d frontend`
- Porta 3000 occupata: `netstat -ano | findstr :3000` (Windows) e termina il processo

### Backend non parte

```bash
docker logs wcm-backend --tail 30
```

Cause comuni:

- Errore import Python (es. dopo modifica file): controlla syntax error
- DB non ready: aspetta che `wcm-supabase-db` sia `healthy`, poi `docker compose restart backend`

### Agent non risponde / resta "in attesa"

Il container ha `--wait-for-client` di debugpy. O:

- Attacca debugger VSCode (F5 launch.json)
- Oppure commenta temporaneamente la riga `command:` in `docker-compose.override.yml`, poi:

```bash
docker compose up -d agent
```

### Stripe webhook non arriva

1. Verifica che `stripe listen` sia acceso in un terminale
2. `STRIPE_WEBHOOK_SECRET` in `.env` corrisponde al `whsec_...` stampato dalla CLI
3. `docker compose restart backend` dopo ogni modifica al secret
4. Se vedi "Invalid signature" nei log backend: il secret è vecchio

### Email non arriva

- **Mailhog** (dev): http://localhost:8025 — se vuoto, SMTP non punta a mailhog
- **Aruba** (prod): verifica in `.env` `SMTP_HOST=smtps.aruba.it`, `SMTP_PORT=465`, `SMTP_USER=admin@agentengineering.it`, `SMTP_PASS=Ag3nt!2026`
- Error `535 5.7.0`: credenziali sbagliate o account Aruba bloccato. Fai un login manuale su webmail.aruba.it per sbloccare

### AI ritorna 402 "AI non attiva"

Controlla `/settings/agent-status`:

```bash
# Sostituisci <JWT> con un token valido
curl -s -H "Authorization: Bearer <JWT>" http://localhost:8100/api/v1/settings/agent-status
```

Deve ritornare `"active": true`. Se no:

- `has_byok: false` + `plan_has_agent: false` → utente non è su piano con AI. Serve Pro+ o BYOK.
- `system_key_set: false` → admin non ha configurato la system key. Vai a passo 1.6.

### AI ritorna 402 "Crediti esauriti"

Consumo effettivo > budget piano + top-up. Verifica:

```bash
docker exec -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres -c "
SELECT p.ai_credits_month, uc.ai_credits_used, acb.topup_credits
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
LEFT JOIN usage_counters uc ON uc.user_id = s.user_id AND uc.period_start = date_trunc('month', now())::date
LEFT JOIN ai_credit_balance acb ON acb.user_id = s.user_id
WHERE s.user_id = (SELECT id FROM users WHERE email='...');
"
```

### Pulsante "Gestisci abbonamento" non compare

Visibile solo se:

- Subscription ha `stripe_subscription_id` non nullo (cioè l'utente ha fatto almeno un Checkout completato)
- Piano non è `free`

Se sei in trial → non hai ancora `stripe_subscription_id` → è normale che non appaia. Fai Checkout a piano pagato, poi riprova.

### Template / banner home page con numeri vecchi

Se i PNG dei banner sono vecchi (es. "2.500 messaggi AI" invece di "200 crediti AI"):

```bash
# Rigenera dai SVG (già aggiornati)
cd c:/Users/GiuseppeZileni/Git/wamply/frontend/public/stripe
python make_banners.py
```

Poi **Ctrl+Shift+R** in browser per bustare la cache.

---

## Reset ambiente

### Reset di un singolo utente di test

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres <<'SQL'
DELETE FROM auth.users WHERE email = 'test1@gmail.com';
SQL
```

La `ON DELETE CASCADE` su `public.users.id` cancella anche: subscription, usage_counters, ai_credit_balance, ai_credit_purchases, ai_usage_ledger, ai_config, whatsapp_config, contatti, template, campagne.

### Reset solo consumo crediti (mantieni utente)

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres <<'SQL'
UPDATE usage_counters SET ai_credits_used = 0
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com')
  AND period_start = date_trunc('month', now())::date;
UPDATE ai_credit_balance SET topup_credits = 0
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
UPDATE subscriptions
SET ai_credits_80_warning_sent_at = NULL, ai_credits_100_reached_at = NULL
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
DELETE FROM ai_usage_ledger WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com');
SQL
```

### Reset trial (forza scadenza)

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres -c "
UPDATE subscriptions SET current_period_end = now() - interval '1 minute'
WHERE user_id = (SELECT id FROM users WHERE email='test1@gmail.com')
  AND status = 'trialing';
"
```

Al prossimo check `plan_limits.py` lo downgrada a `free` automaticamente.

### Reset completo DB (nuclear)

```bash
docker compose down -v
docker compose up -d
# Aspetta init DB, poi riapplica migration 020 e 021 (non sono in docker-entrypoint-initdb.d se il volume viene azzerato? verifica)
```

**Attenzione**: perdi anche i seed users. Dovrai rigenerarli:

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db psql -U supabase_admin -d postgres < c:/Users/GiuseppeZileni/Git/wamply/supabase/seed.sql
```

---

## Note operative

### Carte di test Stripe

| Numero | Scenario |
|--------|----------|
| `4242 4242 4242 4242` | Pagamento OK senza 3DS |
| `4000 0025 0000 3155` | Richiede 3D Secure (simula auth banca) |
| `4000 0000 0000 9995` | Fondi insufficienti (decline) |
| `4000 0000 0000 0341` | OK al primo, poi fallisce alla renewal |

Scadenza: qualsiasi futura (`12/34`). CVC: qualsiasi 3 cifre. Nome/indirizzo: qualsiasi.

### Trigger eventi Stripe via CLI

```bash
# Forza invoice.payment_failed (per testare past_due)
stripe trigger invoice.payment_failed

# Forza trial_will_end (notifica 3gg)
stripe trigger customer.subscription.trial_will_end

# Riinvia un evento specifico
stripe events resend evt_...
```

### Test clocks (avanzare tempo Stripe senza aspettare)

Dashboard Stripe test → Customers → seleziona customer → Subscriptions → Actions → **Advance test clock** → avanza di 14gg/30gg per simulare trial expire o renewal.

### Background task rate

Due loop asyncio girano nel backend, tick ogni 3600s (1h):

1. `_trial_reminder_loop` — reminder 3gg/1gg trial in scadenza
2. `_credit_reminder_loop` — warning 80% / email esaurimento 100%

Per testarli subito senza aspettare, usa lo script Python mostrato nelle fasi 2.9 / 2.10.

### Dove vedere i log

```bash
# Backend in tempo reale
docker logs -f wcm-backend

# Agent
docker logs -f wcm-agent

# Tutti in grep
docker compose logs -f | grep -i "error\|warning"
```

### Seed users disponibili

| Email | Password | Ruolo | Piano | Note |
|-------|----------|-------|-------|------|
| `admin@wcm.local` | `Admin123!` | admin | — | Per Customer Portal va creato Checkout |
| `user1@test.local` | `User123!` | user | Starter | Seed, no `stripe_subscription_id` |
| `user2@test.local` | `User123!` | user | Professional | Seed, no `stripe_subscription_id` |

**Per testare Checkout Stripe end-to-end, registra sempre un utente nuovo** — i seed non hanno `stripe_customer_id` pre-popolato.

---

## Checklist finale

Dopo aver completato tutte le fasi, devi poter rispondere SÌ a queste domande:

- [ ] Registrazione nuovo utente → email OTP arriva e il codice funziona
- [ ] Dashboard: banner trial amber visibile, sidebar ha "Crediti AI"
- [ ] Template AI: generate/improve/compliance/translate funzionano e scalano i crediti corretti
- [ ] Chat agent risponde, ricorda il contesto, routing Opus su intent "campagna"
- [ ] Wizard campagna: Planner ritorna suggerimento, Preview Personalizzazione ritorna 3 esempi
- [ ] Stripe Checkout subscription: pagamento completato, subscription attiva in DB
- [ ] Stripe Checkout top-up: webhook applica credits, storico mostra riga completed
- [ ] Warning 80%: banner amber + email arrivata
- [ ] Esaurimento 100%: banner rose + email + API ritorna 402
- [ ] Customer Portal: apre dal pulsante, Cancel programma correttamente con badge UI
- [ ] Admin AI Costs: KPI popolati, chart timeline presente
- [ ] Admin AI Revenue: MRR + topup revenue separati, by_plan e by_pack corretti
- [ ] Home page IT → EN: language switcher funziona, tutto il copy tradotto

Se qualcosa va storto, documenta con screenshot + log e ne parliamo.
