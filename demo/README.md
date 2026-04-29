# Wamply — Demo standalone

Avvia un'istanza completa di Wamply sul tuo computer in **una cartella, un comando, zero compilazione**.

> **Solo uso demo / locale** — non per produzione.

---

## Pre-requisito unico

| Sistema | Cosa serve |
| --- | --- |
| macOS | [Docker Desktop](https://www.docker.com/products/docker-desktop/) installato |
| Windows | [Docker Desktop](https://www.docker.com/products/docker-desktop/) installato |
| Linux | Docker engine (`curl -fsSL https://get.docker.com \| sh`) |

**Non serve** `git`, **non serve** clonare il repo, **non serve** Node, Python o `make`. Tutte le 4 immagini Wamply (frontend, backend, agent, db con migrations) vengono scaricate automaticamente da GitHub Container Registry.

---

## Avvio rapido

### macOS / Linux

```bash
chmod +x setup.sh
./setup.sh
```

### Windows

Doppio click su `setup.bat`, oppure da PowerShell:

```powershell
.\setup.ps1
```

Lo script:

1. Verifica che Docker sia installato e in esecuzione (lo avvia se serve)
2. Crea il file `.env` con i default sensati
3. Scarica le immagini necessarie (~600 MB la prima volta)
4. Avvia tutti i container e attende che siano pronti
5. Stampa URL e credenziali

Tempo totale alla **prima esecuzione**: ~3-5 minuti (dipende dalla connessione).
Avvii successivi: ~30 secondi.

---

## URL e credenziali demo

| Servizio | URL |
| --- | --- |
| Frontend | <http://localhost:3000> |
| Admin panel | <http://localhost:3000/admin> |
| Email (Mailhog) | <http://localhost:8025> |
| Redis UI | <http://localhost:8001> |

| Account | Email | Password |
| --- | --- | --- |
| Admin | `admin@wcm.local` | `Admin123!` |
| Utente 1 | `user1@test.local` | `User123!` |
| Utente 2 | `user2@test.local` | `User123!` |

---

## Configurazione integrazioni esterne

Twilio, Stripe e Claude API si configurano **dopo l'avvio** dal pannello admin (cifrate in DB):

| Integrazione | Dove |
| --- | --- |
| **Claude API Key** | <http://localhost:3000/admin> → tab "Claude API" |
| **Twilio WhatsApp** | <http://localhost:3000/admin> → tab "Twilio" |
| **Stripe Pagamenti** | <http://localhost:3000/admin> → tab "Pagamenti" |

Senza queste credenziali la demo è comunque **navigabile**: vedi UI, dashboard, contatti, template. L'invio reale di messaggi WhatsApp / l'incasso reale Stripe richiedono le rispettive credenziali.

---

## Menu del setup script

Quando rilanci lo script con la demo già attiva, ti propone:

| Scelta | Azione |
| --- | --- |
| **1** | Mostra solo URL e credenziali |
| **2** | Riavvia i container (nessuna perdita di dati) |
| **3** | Aggiorna alle immagini più recenti (pull + ricrea) |
| **4** | Reset completo — cancella database e ricomincia |

---

## Aggiornare la demo

Le immagini Wamply seguono il branch `master` con tag `latest`. Per aggiornare:

```bash
./setup.sh
# Scegli l'opzione [3] "Aggiorna le immagini"
```

Per pinnare una versione specifica, edita `.env`:

```env
WAMPLY_TAG=v1.2.3
```

---

## Comandi manuali utili

Dalla cartella `demo/`:

```bash
docker compose -f docker-compose.demo.yml ps           # stato dei container
docker compose -f docker-compose.demo.yml logs -f      # log in tempo reale
docker compose -f docker-compose.demo.yml down         # ferma (mantiene i dati)
docker compose -f docker-compose.demo.yml down -v      # ferma e cancella tutto
docker compose -f docker-compose.demo.yml pull         # scarica ultime immagini
```

---

## Risoluzione problemi

**Porta già in uso (3000, 5432, 6379, 8001, 8100, 8025)**
Un altro processo occupa una di queste porte. Trova e ferma il processo, oppure modifica le porte in `docker-compose.demo.yml`.

**`dependency failed to start`**
Capita se Postgres impiega più di 90s al primo cold boot (macchine lente). Rilancia lo script: la seconda volta i dati esistono già e il boot è quasi istantaneo.

**Docker dice "image not found" o pull lento**
Verifica connessione a `ghcr.io`. Le immagini sono pubbliche, non serve login Docker.

**Reset completo**
Lancia lo script e scegli `[4] Reset completo` (richiede di digitare `reset` per conferma).

---

## File in questa cartella

| File | A cosa serve |
| --- | --- |
| `setup.sh` | Avvio per macOS / Linux |
| `setup.ps1` | Avvio per Windows (PowerShell) |
| `setup.bat` | Wrapper Windows che lancia `setup.ps1` |
| `docker-compose.demo.yml` | Definizione dei 10 servizi (immagini pubbliche) |
| `kong.yml` | Config dell'API gateway Kong |
| `.env.example` | Variabili opzionali da copiare in `.env` |
| `db/Dockerfile` | Sorgente dell'immagine `wcm-db-seed` (solo per CI) |
| `contatti_wamply_*.csv` | Liste di contatti fake per provare l'import |
| `template_contacts_fake.xlsx` | Template Excel per import contatti |
