# Wamply — Demo Setup

Script di installazione e avvio per demo locali e testing interno.

> **Solo uso locale / demo** — non adatto alla produzione.

---

## Requisiti minimi

| Requisito | Note |
|-----------|------|
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
4. **Configura Twilio** — chiede se usare la sandbox di test o credenziali di produzione
5. **Build e avvio** — esegue `make setup` al primo avvio, `make up` nei successivi
6. **Health check** — attende che tutti i servizi siano pronti
7. **Mostra riepilogo** — URL, credenziali demo e comandi utili

### Menu al secondo avvio

Se Wamply è già in esecuzione, lo script propone:

| Scelta | Azione |
|--------|--------|
| **1** | Mostra solo URL e credenziali |
| **2** | Riavvia i container (nessuna perdita di dati) |
| **3** | Gestisci configurazioni / cambia Twilio |
| **4** | Reset completo — cancella il database |

---

## URL e credenziali demo

| Servizio | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Admin panel | http://localhost:3000/admin |
| Email (Mailhog) | http://localhost:8025 |
| Redis UI | http://localhost:8001 |

| Account | Email | Password |
|---------|-------|----------|
| Admin | admin@wcm.local | Admin123! |
| Utente 1 | user1@test.local | User123! |
| Utente 2 | user2@test.local | User123! |

> La **Claude API Key** si imposta nell'admin panel → tab "Claude API".

---

## Profili di configurazione

Lo script supporta profili nominati per salvare e ripristinare rapidamente credenziali Twilio diverse (es. un cliente per ogni demo).

I profili vengono salvati in `demo/configs/` (esclusi da git — contengono credenziali reali).

### Flusso tipico

```
# Prima della demo con il cliente Acme
./demo/setup.sh  →  [3] Gestisci configurazioni  →  [2] Salva  →  "cliente-acme"

# Durante la demo, per passare da un cliente all'altro
./demo/setup.sh  →  [3] Gestisci configurazioni  →  [1] Carica  →  "cliente-acme"
# Lo script chiederà se riavviare backend e agent (senza rebuild)
```

I profili salvano queste variabili:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM`
- `TWILIO_MESSAGING_SERVICE_SID`

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

**Build fallisce dopo un reset**
```bash
docker system prune -f
./demo/setup.sh   # o setup.bat su Windows
```

**Lo script non trova `make` su Windows**
Usare `setup.bat` / `setup.ps1` — su Windows lo script invoca `docker compose` direttamente senza richiedere `make`.
