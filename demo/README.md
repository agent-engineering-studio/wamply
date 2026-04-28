# Wamply — Demo Setup

Script di installazione e avvio per demo locali e testing interno.

> **Solo uso locale / demo** — non adatto alla produzione.

---

## Requisiti minimi

| Requisito | Note |
| --------- | ---- |
| Windows 10+ / macOS 10.15+ / Linux (Ubuntu 20+) | — |
| Connessione internet | Per il primo build (~5-10 min) |
| 8 GB RAM liberi | Docker + tutti i servizi |
| 10 GB spazio disco | Immagini Docker + dati |

Docker Desktop viene installato automaticamente dallo script se non è presente.

---

## Avvio rapido

### macOS / Linux

```bash
chmod +x demo/setup.sh
./demo/setup.sh
```

### Windows

Doppio click su `demo/setup.bat`
oppure da PowerShell:

```powershell
.\demo\setup.ps1
```

---

## Cosa fa lo script

1. **Verifica Docker** — installa Docker Desktop se mancante, lo avvia se fermo
2. **Configura `.env`** — crea il file da `.env.example` se non esiste
3. **Rileva lo stato** — sceglie automaticamente tra primo avvio, riavvio o reset
4. **Build e avvio** — esegue `make setup` al primo avvio, `make up` nei successivi
5. **Health check** — attende che tutti i servizi siano pronti
6. **Mostra riepilogo** — URL, credenziali demo e link al pannello admin

> Twilio, Stripe e Claude API **non vengono più chiesti dallo script**: si configurano dopo l'avvio dal pannello admin (cifrate in DB, niente .env). Vedi sezione _Configurazione integrazioni_ sotto.

### Menu al secondo avvio

Se Wamply è già in esecuzione, lo script propone:

| Scelta | Azione |
| ------ | ------ |
| **1** | Mostra solo URL e credenziali |
| **2** | Riavvia i container (nessuna perdita di dati) |
| **3** | Reset completo — cancella il database |

---

## URL e credenziali demo

| Servizio | URL |
| -------- | --- |
| Frontend | <http://localhost:3000> |
| Admin panel | <http://localhost:3000/admin> |
| Email (Mailhog) | <http://localhost:8025> |
| Redis UI | <http://localhost:8001> |

| Account | Email | Password |
| ------- | ----- | -------- |
| Admin | `admin@wcm.local` | Admin123! |
| Utente 1 | `user1@test.local` | User123! |
| Utente 2 | `user2@test.local` | User123! |

---

## Configurazione integrazioni

Tutte le credenziali si configurano dal pannello admin dopo l'avvio. Sono salvate **cifrate** in `system_config` lato DB, e si possono cambiare a runtime senza redeploy.

| Integrazione | Dove configurarla | Note |
| ------------ | ----------------- | ---- |
| **Claude API Key** | <http://localhost:3000/admin> → tab "Claude API" | Master key di sistema. Gli utenti possono usare BYOK dal proprio settings. |
| **Twilio WhatsApp** | <http://localhost:3000/admin> → tab "Twilio" | Master account. I subaccount per-tenant sono creati automaticamente quando un business viene provisionato. |
| **Stripe Pagamenti** | <http://localhost:3000/admin> → tab "Pagamenti" | Secret key, webhook secret, Price ID dei piani e dei top-up pack. |

> Niente più variabili Twilio/Stripe/Claude in `.env`: erano solo placeholder e non venivano usate. Il `.env.example` mantiene `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` come **fallback opzionale** per CI / dev senza UI.

---

## Comandi manuali utili

Dalla root del progetto:

```bash
make down          # Ferma tutti i container
make up            # Riavvia (senza rebuild né cancellazione dati)
make logs          # Log in tempo reale
make setup         # Reset completo (cancella volumi e ricostruisce)

docker compose restart backend agent   # Applica nuove credenziali .env senza rebuild
```

---

## Risoluzione problemi

**Docker non si avvia su Windows**
Aprire Docker Desktop dal menu Start, completare il setup iniziale (accettare i termini), poi rieseguire lo script.

**Porta già in uso**
Un altro processo occupa la porta 3000, 8025 o 8001. Fermare il processo o modificare le porte in `docker-compose.yml`.

### Build fallisce dopo un reset

```bash
docker system prune -f
./demo/setup.sh   # o setup.bat su Windows
```

**Lo script non trova `make` su Windows**
Usare `setup.bat` / `setup.ps1` — su Windows lo script invoca `docker compose` direttamente senza richiedere `make`.
