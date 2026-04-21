# Fix: Email Confirmation Flow (2026-04-21) — **SUPERATO**

> **⚠️ Questo documento è superato. Non applicare le fix descritte qui.**
> Al test end-to-end il flusso link-email non ha funzionato: GoTrue genera ancora link PKCE (`token=pkce_*`) e **non** `token_hash`, perché il client Supabase JS usa PKCE di default. Il nuovo route handler `app/callback/route.ts` previsto qui non verrebbe mai raggiunto con i parametri che aspetta.
>
> **Decisione presa:** abbandonare il flusso link-in-email e tenere **solo** il flusso con codice OTP a 6 cifre (già testato e funzionante via `confirm-email/page.tsx` + `verifyOtp({ email, token, type: "signup" })`). Il link nell'email è stato rimosso dal template HTML.
>
> **Motivo:** GoTrue gira su `:9999`, Next su `:3000`. PKCE richiede che il verifier-cookie e la sessione stiano sullo stesso dominio. Con questa topologia il link non può chiudere correttamente il signup senza riscrittura infrastrutturale (Kong reverse proxy su dominio unico) o disabilitazione di PKCE lato client (peggiora la security).
>
> **File conseguente (post-decisione):**
> - `frontend/src/app/callback/route.ts` — unificato con il vecchio `(auth)/callback/route.ts` per evitare il conflitto di routing Next.js. Gestisce sia il flusso OAuth (`code`) sia l'eventuale `token_hash` futuro. È lasciato in place come safety-net, non è parte del flusso primario.
> - `frontend/public/email-templates/confirmation.html` — link rimosso, codice OTP resta l'unico metodo di conferma.
>
> Il resto di questo documento è conservato come contesto storico.

---

Handoff per sessioni Claude successive. Documenta il fix dei due problemi sul flusso di conferma email di Wamply.

## Problema riportato

Utente registrato riceveva email di conferma senza template HTML brandizzato (loghi/colori Wamply) e, cliccando il link nell'email, veniva reindirizzato a:

```
http://localhost:3000/?error=invalid_request&error_code=bad_oauth_callback&error_description=OAuth+state+parameter+missing
```

## Root cause

Due problemi distinti, entrambi confermati dai log di `wcm-supabase-auth`.

### 1. Template HTML mai caricato

GoTrue v2.170.0 **non supporta** lo schema `file://` per i template. La config precedente:

```yaml
GOTRUE_MAILER_TEMPLATES_CONFIRMATION: "file:///etc/gotrue/templates/confirmation.html"
```

causava nei log:
```
Error loading template from file:///etc/gotrue/templates/confirmation.html:
Get "http://localhost:3000file///etc/gotrue/templates/confirmation.html":
dial tcp: lookup localhost:3000file: no such host
```

GoTrue interpretava il valore come URL relativo e lo concatenava a `SITE_URL` tentando un HTTP GET. Fallback sul template builtin → nessun branding.

### 2. Nessuna route `/callback` in Next.js

`docker-compose.yml` imposta `GOTRUE_MAILER_URLPATHS_CONFIRMATION: "/callback"`, quindi il link email puntava a `http://localhost:3000/callback?token_hash=...&type=signup`.

Ma `/callback` **non esisteva** in `frontend/src/app/`. Il browser finiva per colpire l'endpoint OAuth `/callback` di GoTrue (usato per Google OAuth), che esige uno `state` cookie e rispondeva:

```
400: OAuth state parameter missing   status: 303
```

con redirect a `SITE_URL/` più i parametri di errore.

## Modifiche applicate

### File creati

- **`frontend/src/app/callback/route.ts`** — Route handler GET che:
  - Legge `token_hash` + `type` dalla query string
  - Valida `type` contro la lista `EmailOtpType` di `@supabase/supabase-js`
  - Chiama `supabase.auth.verifyOtp({ token_hash, type })` tramite il server client `@/lib/supabase/server`
  - Redirige a `/dashboard` se OK, a `/confirm-email?error=<msg>` se errore, a `/confirm-email?error=invalid_link` se param mancanti

- **`frontend/public/email-templates/confirmation.html`** — Copia del template HTML brandizzato Wamply. Servito da Next.js come static asset, raggiungibile da GoTrue via `http://host.docker.internal:3000/email-templates/confirmation.html`.

### File modificati

- **`docker-compose.yml`** (service `supabase-auth`):
  - `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` → da `file:///etc/gotrue/templates/confirmation.html` a `http://host.docker.internal:3000/email-templates/confirmation.html`
  - Rimossa la sezione `volumes: [./supabase/templates:/etc/gotrue/templates:ro]` (obsoleta)

Scelto `host.docker.internal` (invece di `frontend:3000`) per coerenza con Kong (che già lo usa per `backend` e `agent`) e per funzionare sia se il frontend gira in container sia in locale via `npm run dev`.

### File/directory rimossi

- **`supabase/templates/confirmation.html`** e directory `supabase/templates/` — era untracked, non committata. Contenuto trasferito a `frontend/public/email-templates/`.

### Container

- `wcm-supabase-auth` ricreato con `docker compose up -d --force-recreate supabase-auth`. Health OK, `host.docker.internal` risolve a `192.168.65.254` dentro il container.

## Verifica

### Testato
- Risoluzione DNS `host.docker.internal` dentro il container auth: OK
- Container auth avvia senza errori di template all'avvio (i template vengono fetchati on-demand all'invio email)

### NON testato end-to-end
Al momento del fix, il frontend non era in esecuzione (porta 3000 non risponde). Flusso completo da validare:

1. Avviare stack: `docker compose up -d` (assicurarsi che `frontend`, `mailhog`, `supabase-kong` siano up)
2. Registrare un nuovo utente
3. Aprire Mailhog su `http://localhost:8025` e verificare che l'email abbia:
   - Logo W-wave Wamply
   - Banner gradient navy (`#1B2A4A` → `#0F1B33`)
   - Codice a 6 cifre in box teal
4. Cliccare il link nell'email → deve atterrare su `/dashboard` con sessione valida (non più `/?error=bad_oauth_callback`)
5. In alternativa al link, incollare il codice a 6 cifre in `/confirm-email` (flusso primario, già funzionante in precedenza)

### Debug se il template non si carica
Controllare i log: `docker logs wcm-supabase-auth | grep -i template`. Se appare ancora un errore di fetch, verificare che `http://localhost:3000/email-templates/confirmation.html` risponda 200 dall'host.

## Contesto architetturale

- **Flusso primario di conferma email**: 6-digit OTP code via `{{ .Token }}` nel template, verificato da `frontend/src/app/(auth)/confirm-email/page.tsx` tramite `supabase.auth.verifyOtp({ email, token, type: "signup" })`. Già funzionante prima del fix.
- **Flusso secondario (link)**: ora gestito dalla nuova route `/callback` che usa `verifyOtp({ token_hash, type })`. Token hash arriva direttamente nell'URL, l'email non serve.
- `GOTRUE_URI_ALLOW_LIST` è vuota → GoTrue valida redirect contro `SITE_URL` (`http://localhost:3000`). `emailRedirectTo: ${origin}/callback` usato in register/resend passa il check.

## Stato git (al momento del fix)

Nessuna modifica committata. Modifiche pending:
- M `docker-compose.yml`
- ?? `frontend/src/app/callback/route.ts`
- ?? `frontend/public/email-templates/confirmation.html`
- D `supabase/templates/confirmation.html` (era untracked, rimossa fisicamente)

Modifiche preesistenti su altri file (admin pages, middleware, migrations 017, etc.) **non toccate** da questa sessione.
