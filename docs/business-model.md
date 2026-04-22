# Wamply — Modello di Business

> Documento di riferimento per team commerciale e marketing.
> Versione: 2026-04-21
> Status: modello definito, alcune features TODO (vedi §12 Roadmap implementativa)

---

## 1. Executive Summary

**Wamply è il SaaS chiavi-in-mano per campagne WhatsApp Business con AI integrata, pensato per PMI italiane.**

- **Cliente target:** PMI (5–50 dipendenti) con bassa alfabetizzazione tecnica che vuole usare l'AI per il marketing senza configurare nulla
- **Proposta di valore:** "Apri l'account, manda la prima campagna personalizzata dall'AI in 5 minuti. Il resto lo facciamo noi"
- **Differenziazione:** personalizzazione AI per ogni singolo messaggio (Claude Anthropic), onboarding WhatsApp assistito (pratiche Meta Business gestite internamente), multi-tenant sicuro con subaccount Twilio isolati per cliente
- **Pricing:** 3 piani mensili €79 / €249 / €799 + sistema a crediti per funzioni AI + pacchetti extra (crediti AI / crediti WhatsApp) acquistabili su richiesta
- **Canali revenue:** subscription ricorrente (core), top-up one-shot (espansione), enterprise contracts (upsell futuro)
- **Modello "dual-key":** ogni utente, su qualsiasi piano, può scegliere di usare la chiave Anthropic di Wamply (consumando crediti inclusi) o la propria API key Claude (BYOK, nessun credito conteggiato). Twilio invece è **sempre** gestito da Wamply
- **Break-even atteso per cliente:** ~30 giorni su Pro/Enterprise, ~90 giorni su Starter

---

## 2. Buyer Persona

### La PMI italiana tipo

**Settori target primari:**
- Ristorazione (trattorie, pizzerie, ristoranti)
- Beauty & wellness (parrucchieri, estetisti, palestre)
- Retail locale (boutique, negozi alimentari, librerie)
- Servizi professionali (consulenti, studi legali/commerciali)
- Artigianato (falegnami, sarti, riparazioni)

**Dimensione:**
- 5–50 dipendenti
- Fatturato €200k–5M/anno
- Budget marketing: €100–500/mese

**Chi decide:**
- Titolare o socio (50–60 anni tipicamente) — ha l'ultima parola su spesa
- Figlio/a del titolare o responsabile marketing junior (25–35 anni) — è l'operatore quotidiano

**Cosa vuole:**
- Raggiungere i suoi clienti esistenti con comunicazioni mirate (non spam)
- Offerte, promo stagionali, reminder appuntamenti, auguri personalizzati
- Risparmio tempo: oggi copia-incolla messaggi WhatsApp uno per uno, o usa un gruppo broadcast con testo uguale per tutti
- Suonare professionale senza essere un tecnico

**Paure:**
- "Costerà più di quanto mi rende"
- "Sarà complicato, non ci capisco niente"
- "Mio cugino mi fa le cose gratis su WhatsApp, perché dovrei pagare?"
- "Se sbaglio mi chiudono il numero"
- "I dati dei miei clienti sono al sicuro?"

**Come parla:**
- Non dice mai "API", "webhook", "template", "rate limit", "cloud"
- Dice: "gli mando un messaggio", "il numero aziendale", "la lista clienti", "il testo da inviare"

**Competitor a cui ha detto no:**
- Strumenti troppo complessi (Twilio diretto, Brevo, HubSpot)
- Soluzioni "fai da te" WhatsApp Business App (limitate a 256 contatti broadcast)
- Invio manuale via WhatsApp personale (sospensione numero, limiti Meta)

**Cosa lo fa scegliere Wamply:**
- Onboarding assistito: qualcuno in Wamply si occupa delle pratiche Meta al posto suo
- AI scritta in italiano semplice ("L'AI ti scrive il messaggio")
- Prezzo prevedibile (no fatture a sorpresa)
- Trial 14 giorni gratis senza carta

---

## 3. Modello di business — panoramica

### 3.1 Un prodotto, due leve di consumo

| Cosa | Chi la fornisce | Pagamento |
|------|-----------------|-----------|
| Piattaforma (UI, AI agent, database, analytics) | Wamply | Abbonamento mensile |
| WhatsApp sender (numero + Twilio) | Sempre Wamply (subaccount dedicato al cliente) | Incluso nel piano + pacchetti extra |
| Chiave Claude (per personalizzazione AI) | Wamply OPPURE cliente (BYOK) | Crediti inclusi nel piano / pacchetti extra / direttamente Anthropic |
| Pratica Meta Business Approval | Wamply (team interno) | Incluso |

### 3.2 Matrice di utilizzo

Ogni cliente sceglie **una modalità Claude** (default: Wamply), indipendente dal piano:

```
                ┌─ CLAUDE WAMPLY  → consuma crediti AI + può comprarne extra
                │
  QUALSIASI ────┤
  PIANO         │
                └─ CLAUDE BYOK    → paga Anthropic direttamente + NO crediti AI
                                    (risparmia sui costi AI, gestione sua)

  WhatsApp      → sempre gestito da Wamply (subaccount dedicato)
                  consuma messaggi piano + può comprarne extra (SEMPRE)
```

### 3.3 Perché "dual-key" (Wamply o BYOK Claude)

**Wamply Claude (default):**
- PMI non deve capire cos'è un'API key
- Costo prevedibile: "X crediti al mese, extra pagabili"
- Target: 95% dei clienti

**BYOK Claude (opzione avanzata):**
- Cliente ha già un account Anthropic (agenzia marketing evoluta, sviluppatore interno, azienda strutturata)
- Vuole vedere i costi Anthropic separatamente
- Non paga crediti a Wamply, ma paga lo stesso abbonamento (la piattaforma vale)
- Target: 5% dei clienti — è un'opzione "nascosta" nelle impostazioni, non reclamizzata in homepage

### 3.4 Perché non BYOK Twilio

Twilio senza assistenza è impossibile per la PMI target:
- Serve verificare Facebook Business Manager (Meta)
- Serve approvare il display name del brand
- Serve approvare i template messaggi
- I tempi di approvazione dipendono da Meta (3–14 giorni)

Wamply **gestisce tutto internamente**. Ogni cliente riceve un subaccount Twilio dedicato dentro l'account master Wamply — isolamento totale, ma onboarding fatto dal team Wamply.

---

## 4. Pricing

### 4.1 Piani mensili

| Piano | Prezzo | Messaggi WhatsApp/mese | Crediti AI/mese | Contatti | Campagne/mese | Template | Team |
|-------|-------:|------------------------:|----------------:|---------:|--------------:|---------:|-----:|
| **Free Trial** | €0 | 100 (sandbox) | 50 | 100 | Illimitate | 3 | 1 |
| **Starter** | €79 | 500 | 0 (BYOK only) | 500 | 5 | 5 | 1 |
| **Professional** | €249 | 2.500 | 200 | 5.000 | 20 | 20 | 3 |
| **Enterprise** | €799 | 10.000 | 1.500 | 50.000 | Illimitate | Illimitati | 10 |

**Note pricing:**
- **Free Trial** dura 14 giorni, si attiva al signup senza carta. Usa sender sandbox Twilio (non brandizzato). Dopo il trial, senza upgrade, l'account va in stato "Free" (read-only, niente invii).
- **Starter** ha AI disattivata di default. L'utente la attiva configurando la propria API key Claude (BYOK). Chi non ha Claude usa Starter solo come "WhatsApp broadcast professionale" con sender brandizzato.
- **Professional** e **Enterprise** hanno AI inclusa (con crediti Wamply). L'utente può comunque scegliere BYOK e risparmiare sui crediti — ma il prezzo piano rimane lo stesso (paga la piattaforma).
- **Enterprise**: include onboarding assistito 1:1, email prioritaria, account manager.
- **Trial** parte automaticamente al signup. Al 3° e 1° giorno dalla scadenza arriva email di reminder. Alla scadenza senza upgrade, stato "Free" (bloccato).

### 4.2 Pacchetti "Crediti AI" (top-up, validità 12 mesi)

Disponibili **solo** se l'utente usa Claude Wamply (non BYOK). Consumati dopo che finisce il budget mensile del piano.

| Pack | Crediti | Prezzo | € / credito |
|------|--------:|-------:|------------:|
| Small | 100 | €15 | €0.15 |
| Medium | 500 | €59 | €0.118 |
| Large | 2.000 | €199 | €0.10 |
| XL | 10.000 | €799 | €0.08 |

**Cosa fai con un credito:**
- 1 credito = 1 chat con l'agent AI
- 2 crediti = 1 template generato / 1 analisi AI
- 0,5 crediti = 1 messaggio personalizzato in campagna
- 3 crediti = controllo compliance profondo / traduzione
- 5 crediti = pianificazione campagna con strategist AI

### 4.3 Pacchetti "Crediti WhatsApp" (top-up, validità 12 mesi)

Disponibili **sempre** (qualsiasi piano, sia Wamply sia BYOK Claude) — Twilio è fornito sempre da Wamply.

| Pack | Messaggi | Prezzo | € / messaggio |
|------|---------:|-------:|--------------:|
| Small | 500 | €39 | €0.078 |
| Medium | 2.000 | €129 | €0.0645 |
| Large | 5.000 | €279 | €0.0558 |

**Cosa compri:**
- Messaggi WhatsApp aggiuntivi oltre la quota mensile del piano
- Consumati solo quando finisci la quota piano
- Ogni messaggio inviato a un contatto WhatsApp = 1 credito WhatsApp

### 4.4 Unit economics (stima)

| Piano | Ricavo lordo | Costo Twilio stimato | Costo Anthropic stimato | Margine lordo |
|-------|-------------:|---------------------:|------------------------:|--------------:|
| Starter €79 | €79 | €32 (500msg × €0,065) | €0 (BYOK) | ~€47 |
| Professional €249 | €249 | €162 (2.500msg) | €5 (200 crediti) | ~€82 |
| Enterprise €799 | €799 | €650 (10.000msg) | €40 (1.500 crediti) | ~€109 |

**Enterprise margine stretto**: va bilanciato con upgrade a custom contracts sopra i 10k msg/mese. La tabella mostra lo scenario "utente max che satura il piano". Utente medio Enterprise probabilmente usa 6.000–7.000 msg → margine reale ~€200–250.

**Break-even CAC:**
- Starter: €47/mese margine → CAC max €100 per break-even a 3 mesi
- Professional: €82/mese → CAC max €250
- Enterprise: €109/mese (pessimistico) → CAC max €500, ma con LTV 12+ mesi realistico
- Top-up revenue è puro upside (zero CAC marginale)

---

## 5. Onboarding — il percorso chiavi in mano

### 5.1 Signup (5 minuti)

Il cliente arriva sul sito, clicca "Inizia 14 giorni gratis":

1. Email + password + nome
2. Codice OTP arriva via email
3. Atterra in dashboard con **trial già attivo**
4. Non chiediamo dati aziendali. **Registrazione light.**

### 5.2 Trial 14 giorni (sandbox)

Durante il trial il cliente:
- Naviga dashboard, importa contatti, crea template, prova l'AI
- Può mandare **campagne sandbox** (a suoi numeri test, max 100 messaggi) usando un sender tecnico Wamply
- Non può ancora inviare al brand del suo business — serve completare Fase 5.3

Durante questo periodo arrivano:
- Email di benvenuto con video tutorial di 3 minuti
- Email al giorno 3: "Come attivare il tuo numero WhatsApp aziendale"
- Email al giorno 11 e 13: reminder scadenza trial

### 5.3 Attivazione WhatsApp (3–14 giorni, parallela al trial)

Quando il cliente decide di attivare il numero brandizzato (cioè passare a piano pagato), parte l'**onboarding assistito**:

**Step A — Dati azienda**
Il cliente compila un form nella dashboard con:
- Ragione sociale
- Partita IVA
- Indirizzo sede legale completo
- Categoria business (dropdown Meta predefinito)
- Nome commerciale (come apparirà su WhatsApp destinatari)
- Telefono business (quello che diventerà il sender)
- Logo aziendale (può caricarlo dopo)

**Oppure (per PMI meno capaci):**
Il cliente manda email/WhatsApp/telefonata al team Wamply con i dati. Il **socio marketing** apre l'admin e **compila al posto suo**. Il cliente non tocca nulla.

**Step B — Pagamento**
Il cliente paga il piano scelto via Stripe Checkout. Carta memorizzata per rinnovi automatici.

**Step C — Pratica Meta (gestita internamente)**
Il socio marketing:
1. Crea un subaccount Twilio dedicato al cliente
2. Acquista un numero Italian locale sul subaccount (€1/mese, incluso)
3. Avvia la procedura di approval WhatsApp Business con Meta (compila form Meta Business Manager a nome del cliente, con delega)
4. Attende approvazione (Meta impiega 3–14 giorni)

**Durante l'attesa**, la dashboard del cliente mostra **stato in tempo reale**:
- `Pratica in preparazione` → il socio sta compilando
- `Inviata a Meta` → in attesa risposta Meta
- `In revisione` → Meta sta valutando
- `Approvata` → sender attivo, cliente può inviare
- `Rifiutata` → con motivo + istruzioni per correggere
- `Attivo` → primo invio effettuato

Il banner di stato dice chiaramente: **"I tempi di Meta vanno da 3 a 14 giorni e non dipendono da Wamply. Ti notificheremo via email appena Meta approverà il tuo brand."**

### 5.4 Primo invio brandizzato

Quando lo stato passa a `Approvata`:
- Email automatica "Il tuo WhatsApp è attivo, la prima campagna è pronta"
- Dashboard mostra banner verde "Il tuo brand è attivo"
- L'utente può mandare al suo pubblico reale con il display name brandizzato

### 5.5 Dopo il primo invio

- Email di follow-up a +24h con report della campagna
- Suggerimenti dall'AI su come migliorare la prossima
- Invito a provare feature AI avanzate (planner, compliance check)

---

## 6. Dashboard Admin — gestione pratiche Meta

Il socio marketing lavora sempre in `/admin` nella tab **Pratiche WhatsApp** (da implementare).

### 6.1 Tabella riepilogativa

Lista di tutte le aziende:

| Azienda | Piano | Registrazione | Stato pratica | Azioni |
|---------|-------|---------------|---------------|--------|
| Pizzeria Mario | Pro | 10/04 | In revisione (6gg) | Apri → |
| Boutique Anna | Starter | 12/04 | Dati mancanti | Apri → |

Filtri: per stato, per piano, per data.

### 6.2 Scheda singola azienda

Il socio clicca su una riga e apre la scheda:

- **Dati azienda** (tutti editabili): ragione sociale, PIVA, indirizzo, telefono, logo…
- **Upload logo** (se manca)
- **Dropdown stato pratica** con gli stati:
 - `draft` (creata, dati incompleti)
 - `awaiting_docs` (attesa documenti dal cliente)
 - `submitted_to_meta` (inviata a Meta Business Manager)
 - `in_review` (Meta sta valutando)
 - `approved` (Meta ha approvato, sender attivabile)
 - `rejected` (Meta ha rifiutato, con motivo)
 - `active` (sender operativo, primo invio fatto)
 - `suspended` (Meta ha sospeso post-attivazione)
- **Note interne** (visibili solo allo staff)
- **Bottone "Crea subaccount Twilio"** (esegue API Twilio e salva il SID)
- **Bottone "Acquista numero"** (esegue API Twilio, acquista numero italiano per il subaccount)
- **Link esterno** al Meta Business Manager per la pratica (il socio ci lavora fuori da Wamply)
- **Audit log** (chi ha modificato cosa e quando)

### 6.3 Alert per il socio

Sulla tab Admin → "Pratiche WhatsApp":
- Badge numerico sulla voce sidebar con contatore "da lavorare" (es. 3 pratiche in stato `draft` o `awaiting_docs`)
- Alert email giornaliero riepilogativo al socio con pratiche in attesa di azione

---

## 7. Sales script — obiezioni PMI

### Obiezione 1: "Costa troppo"

**Risposta:**
> Il piano Starter parte da €79/mese, ma include 500 messaggi WhatsApp con il TUO brand, non un numero generico. Su WhatsApp Business un solo messaggio verso 500 clienti costa da Twilio circa €32 — noi le diamo 500 messaggi + tutta la piattaforma + WhatsApp brandizzato attivato da noi a €79. Mediamente rientra con 1–2 clienti in più al mese.

### Obiezione 2: "Mio cugino me lo fa gratis su WhatsApp"

**Risposta:**
> WhatsApp Business "personale" ha un limite di 256 contatti broadcast e Meta sospende i numeri se invia troppe volte a non-contatti. Con Wamply è WhatsApp Business Platform ufficiale — zero rischio sospensione, messaggi personalizzati uno per uno (non broadcast), report su chi ha letto, integrazione con il tuo database clienti.

### Obiezione 3: "Non ci capisco niente, è troppo tecnico"

**Risposta:**
> Per questo ci siamo noi. Lei ci manda nome della sua azienda, partita IVA e logo — ci pensiamo noi a fare la pratica con WhatsApp. Tempistiche: 3–14 giorni, decide Meta, non noi. Nel frattempo può provare tutto con un numero di test. Quando Meta approva, riceve un'email e parte.

### Obiezione 4: "I dati dei miei clienti sono al sicuro?"

**Risposta:**
> I dati sono in server italiani (Supabase EU), cifrati, ogni cliente ha il suo sottospazio isolato (subaccount Twilio dedicato). Siamo conformi al GDPR. Nel caso lei decida di lasciare Wamply, le restituiamo tutti i dati esportabili e il numero WhatsApp può essere trasferito al suo nuovo account.

### Obiezione 5: "Se l'AI scrive male fa brutta figura?"

**Risposta:**
> L'AI non invia mai da sola. Lei scrive il testo base, l'AI produce 3 varianti personalizzate per ogni cliente — lei le vede in anteprima prima di inviare. Approva con un click. Se non le piace, rigenera o scrive a mano. L'AI le fa risparmiare tempo, non le toglie il controllo.

### Obiezione 6: "Quanto dura l'attivazione?"

**Risposta:**
> La parte nostra è di 30 minuti. La parte Meta (che non dipende da noi) va da 3 a 14 giorni. Nel frattempo il prodotto funziona in modalità demo e lei si allena. Vediamo mediamente 5-7 giorni lavorativi per l'approvazione Meta in Italia.

### Obiezione 7: "Cosa succede se finisco i messaggi del mese?"

**Risposta:**
> Due opzioni: o compra un pacchetto extra (es. 500 messaggi a €39) con un click, o aspetta il rinnovo del mese successivo. Il prodotto non si ferma: l'attivazione del pacchetto è istantanea dopo il pagamento.

---

## 8. Marketing copy

### 8.1 Homepage — sezioni chiave

**Hero:**
> **Il tuo WhatsApp aziendale. Chiavi in mano.**
> Manda offerte e promozioni ai tuoi clienti via WhatsApp ufficiale. L'AI personalizza ogni messaggio. Noi ci occupiamo di Meta al posto tuo.
> [Inizia 14 giorni gratis — no carta]

**Trust row:**
> 🛡️ Pratiche Meta gestite da noi · 🔒 Dati in Europa · 💳 Pagamenti Stripe · 🤖 Powered by Claude AI

**3 blocchi "come funziona":**
1. **Carichi i contatti** (CSV o manuale) — ti aiutiamo noi se non sai farlo
2. **Scrivi cosa vuoi comunicare** — l'AI adatta il messaggio a ogni cliente
3. **Invii e vedi i risultati** — report in tempo reale, chi ha letto, chi ha risposto

**Sezione "AI Auto-Selection"** (già scritta in messages/it.json):
Routing automatico Haiku/Sonnet/Opus invisibile all'utente.

**Sezione pricing:**
I 3 piani + CTA Enterprise ("Parla con noi").

**FAQ (5 domande):**
1. Serve che io sia esperto di tecnologia?
2. Quanto costa attivare il mio numero WhatsApp?
3. Cosa succede se finisco i messaggi del mese?
4. Posso disdire quando voglio?
5. I miei dati sono al sicuro?

### 8.2 Landing per vertical

**`/ristoranti`** — focus su: reminder prenotazioni, auguri compleanno, promo serate evento, menu del giorno. Testimonial finto ma plausibile di un ristoratore.

**`/beauty`** — focus su: reminder appuntamenti, prodotti in offerta, VIP club, inviti a trattamenti stagionali.

**`/commercio`** — focus su: arrivi nuovi prodotti, promo stagionali, programma fedeltà, recupero carrelli abbandonati (se e-commerce).

Ogni landing ha:
- Hero specifico al settore
- 3 use case con esempi di messaggi reali
- Pricing standard
- FAQ specifiche settore
- CTA trial

### 8.3 Email nurture — 5 email durante il trial

| Giorno | Oggetto | Contenuto |
|--------|---------|-----------|
| 0 (signup) | Benvenuto in Wamply | Video tutorial 3min, 1° step: importa contatti |
| 2 | La tua prima campagna in 5 minuti | Tutorial guidato, invia a un numero di test |
| 5 | Ti aiutiamo con Meta? | CTA "Parla con un consulente" per avviare pratica |
| 10 | Cosa può fare l'AI per te | Esempi reali di personalizzazione, messaggi veri |
| 13 | Il tuo trial scade tra 24 ore | CTA upgrade con urgency soft |

### 8.4 FAQ complete (20 domande per il sito)

**Sul prodotto:**
1. Cos'è Wamply?
2. In cosa è diverso da WhatsApp Business standard?
3. Quanti contatti posso caricare?
4. Come importo i contatti?
5. Posso integrare con il mio gestionale?

**Sull'AI:**
6. Cosa sono i crediti AI?
7. L'AI scrive autonomamente o devo approvare?
8. In quante lingue sa scrivere?
9. Posso usare la mia chiave Claude?
10. L'AI vede i dati dei miei clienti?

**Su WhatsApp/Meta:**
11. Quanto tempo serve per attivare il numero?
12. Serve la partita IVA?
13. Posso usare il mio numero di telefono esistente?
14. Cosa succede se Meta rifiuta la mia pratica?
15. Rischio di essere sospeso da WhatsApp?

**Su prezzi e pagamenti:**
16. Posso disdire quando voglio?
17. Cosa succede se finisco i messaggi del mese?
18. Come funziona la fatturazione?
19. Ricevo la fattura elettronica?
20. I prezzi sono IVA inclusa?

(Le risposte verranno scritte in un secondo passaggio dopo validazione del modello)

---

## 9. Architettura Twilio multi-tenant

Vedi documento separato `architecture-twilio-multitenant.md` per dettagli tecnici.

**Sintesi per team commerciale:**
- Ogni cliente ha un suo **subaccount Twilio isolato** dentro il master account Wamply
- Il cliente non vede mai credenziali Twilio — tutto invisibile
- Se un cliente lascia Wamply, il sender WhatsApp (numero + approvazione Meta) può essere **trasferito al suo nuovo provider** (diritto del cliente, non lock-in)
- Isolamento garantito: sospensione di un cliente non impatta altri
- Fatturazione consolidata nel master account (costi Twilio aggregati su fattura Wamply)

---

## 10. KPI da tracciare

### 10.1 Product & Engagement (dashboard admin)

- **Active users / 30d**: utenti con almeno 1 login nel mese
- **Activated users**: utenti che hanno completato Meta approval + primo invio
- **Time to first campaign**: giorni tra signup e primo invio reale
- **Monthly messages sent**: somma messaggi inviati cross-tenant
- **AI adoption**: % utenti che usano l'AI almeno 1 volta/settimana
- **Feature usage**: top 5 feature AI usate (chat / personalize / compliance / translate / planner)

### 10.2 Revenue & Finance

- **MRR** (Monthly Recurring Revenue): somma piani attivi
- **ARR** (Annual Recurring Revenue): MRR × 12
- **Top-up revenue / mese**: separato per AI credits e WhatsApp credits
- **ARPU** (Average Revenue Per User): MRR ÷ paying customers
- **LTV** (Lifetime Value) stimato per piano
- **CAC** (Customer Acquisition Cost): costo marketing + sales / new paying customers
- **Gross margin per piano**: ricavo − (Twilio + Anthropic)
- **Heavy buyers**: utenti con 3+ top-up/mese (candidati upgrade)

### 10.3 Sales & Onboarding

- **Trial → Paid conversion rate**: % che upgrada entro 14gg
- **Onboarding completion**: % che completa dati azienda
- **Meta approval time**: mediana giorni da submit a approve
- **Meta rejection rate**: % pratiche rifiutate
- **Support tickets / paying customer**: volume ticket mensile
- **Churn mensile**: % clienti che disdicono

### 10.4 Support & Operations

- **Onboarding hours / cliente**: ore socio marketing per attivazione
- **Response time**: tempo medio risposta supporto
- **Issue resolution time**: tempo medio chiusura ticket
- **Meta tickets stuck**: pratiche ferme >10 giorni in `in_review`

---

## 11. Canali di acquisizione

### 11.1 Fase 1 — Organic + Content (mesi 1–3)

- **SEO content marketing**: articoli blog "Come fare WhatsApp marketing nel 2026", "Guida WhatsApp Business API per ristoranti", ecc.
- **YouTube tutorial**: video 3–5 minuti "Come attivare WhatsApp Business"
- **Directory italiane**: iscrizione a G2, Capterra, TrustPilot IT
- **LinkedIn outreach**: il socio contatta direttamente titolari PMI target

### 11.2 Fase 2 — Paid Acquisition (mesi 4–6)

- **Google Ads** keyword "WhatsApp marketing", "WhatsApp Business API" (budget test €1k/mese)
- **Meta Ads** su target PMI titolare (budget test €500/mese)
- **Partnership con consulenti digital marketing** locali — commissione 30% primo mese

### 11.3 Fase 3 — Scale (mesi 7+)

- **Affiliate program**: sconto 20% primo mese per ogni referral, +20% referrer
- **Eventi settore**: ristorazione, beauty — presenza a fiere con tablet demo
- **Case study**: 5 clienti paganti testimonial video

---

## 12. Roadmap implementativa — cosa serve sul prodotto

Quello che **è già fatto** (dal lavoro recente):

- ✅ Signup + trial 14gg + banner countdown
- ✅ Stripe checkout + subscription recurring
- ✅ Stripe Customer Portal (cambio piano, cancel, aggiorna carta)
- ✅ Sistema crediti AI + top-up crediti AI
- ✅ Email warning 80% + esaurimento crediti
- ✅ Admin dashboard AI Costs + AI Revenue
- ✅ Chat agent con silent routing Haiku/Sonnet/Opus
- ✅ Template AI: generate, improve, compliance, translate
- ✅ AI nelle campagne: preview personalizzazione + planner
- ✅ Dual-key Claude (Wamply o BYOK)
- ✅ Email confirmation OTP

Quello che **ancora manca** (priorità decrescente):

### Priorità ALTA (necessario per vendita)

- ⬜ **Pacchetti "Crediti WhatsApp"** — nuovo sistema top-up parallelo ai crediti AI (vedi `task-messages-topup.md`)
- ⬜ **Tabella `businesses`** — dati azienda per cliente
- ⬜ **Tabella `meta_applications`** — stato pratica Meta + dati Twilio subaccount
- ⬜ **Form dati azienda** nel frontend (compila cliente o admin)
- ⬜ **Admin "Pratiche WhatsApp"** — tabella + scheda con dropdown stato + note + audit log
- ⬜ **Banner stato pratica** in dashboard utente con comunicazione tempi Meta
- ⬜ **Creazione subaccount Twilio** automatica da admin
- ⬜ **Sandbox Twilio** per primi 14gg trial
- ⬜ **Upload logo** in Supabase Storage

### Priorità MEDIA (ottimizzazione)

- ⬜ **Fatturazione elettronica italiana SdI** (Task 11 del piano precedente)
- ⬜ **Stripe Tax** attivazione per IVA automatica EU
- ⬜ **Storage S3-compatible** per export dati cliente (diritto GDPR)
- ⬜ **Video tutorial** 3min in homepage + onboarding
- ⬜ **Landing vertical** (ristoranti / beauty / commercio)

### Priorità BASSA (scale)

- ⬜ **Affiliate program**
- ⬜ **API pubblica** per enterprise che vogliono integrare
- ⬜ **White label** (Enterprise+)
- ⬜ **Webhook eventi** per CRM esterni
- ⬜ **App mobile companion** (dashboard readonly + notifiche)

---

## 13. Riepilogo — Cosa deve fare il team commerciale domani

1. **Validare il pricing** con 5–10 potenziali clienti PMI (survey o chiamate): i prezzi €79 / €249 / €799 sono percepiti corretti?
2. **Validare le buyer persona** (ristoranti, beauty, commercio): sono i segmenti giusti o vedete altre nicchie promettenti?
3. **Preparare case study** di 1 cliente pilota per avere un testimonial reale prima del lancio
4. **Scrivere il LinkedIn outreach script** per contattare titolari PMI direttamente
5. **Set up Google Analytics + funnel tracking** per misurare signup → trial → paid conversion
6. **Preparare pitch deck** (12 slide max) per presentazioni commerciali

## 14. Riepilogo — Cosa deve fare il team prodotto (tecnico)

1. **Implementare sistema Crediti WhatsApp** (top-up parallelo ai crediti AI): vedi `task-messages-topup.md`
2. **Implementare registrazione azienda + pratica Meta**: vedi `architecture-twilio-multitenant.md`
3. **Testare end-to-end** lo stack attuale: vedi `testing-guide.md`
4. **Completare** Stripe sotto-task 3 (SdI + Tax) per fatturazione italiana

---

*Questo documento è un lavoro vivo. Ogni decisione presa va riflessa qui. Aggiornamenti significativi richiedono allineamento tra team business e tecnico.*
