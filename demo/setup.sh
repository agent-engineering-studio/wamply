#!/usr/bin/env bash
# =============================================================================
#  Wamply — Demo standalone (macOS / Linux)
#
#  Pre-requisito UNICO: Docker (Desktop o engine) installato.
#  NON serve git, NON serve clonare il repo Wamply: tutto vive in questa
#  cartella. Le 4 immagini Wamply (frontend/backend/agent/db-seed) vengono
#  scaricate da GitHub Container Registry come tutte le altre dipendenze.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.demo.yml"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.example"

# ── Colori ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log_step() { echo -e "\n${BLUE}${BOLD}▶ $1${NC}"; }
log_ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
log_err()  { echo -e "  ${RED}❌ $1${NC}"; exit 1; }

ask() {
  local prompt="$1" default="${2:-}"
  local hint=""
  [ -n "$default" ] && hint=" [${default}]"
  read -r -p "  $(echo -e "${CYAN}${prompt}${hint}: ${NC}")" val
  echo "${val:-$default}"
}

ask_choice() {
  local prompt="$1" default="${2:-1}"
  read -r -p "  $(echo -e "${CYAN}${prompt} [${default}]: ${NC}")" val
  echo "${val:-$default}"
}

# All compose subcommands target THIS folder's compose file. Means the user
# can run the script from anywhere, the demo always uses the bundled YAML.
compose() {
  docker compose --file "$COMPOSE_FILE" "$@"
}

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${CYAN}${BOLD}"
cat << 'BANNER'
  ██╗    ██╗ █████╗ ███╗   ███╗██████╗ ██╗  ██╗   ██╗
  ██║    ██║██╔══██╗████╗ ████║██╔══██╗██║  ╚██╗ ██╔╝
  ██║ █╗ ██║███████║██╔████╔██║██████╔╝██║   ╚████╔╝
  ██║███╗██║██╔══██║██║╚██╔╝██║██╔═══╝ ██║    ╚██╔╝
  ╚███╔███╔╝██║  ██║██║ ╚═╝ ██║██║     ███████╗██║
   ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚══════╝╚═╝
BANNER
echo -e "${NC}"
echo -e "  ${YELLOW}${BOLD}⚠️  Demo locale — non per produzione${NC}"
echo -e "  ${YELLOW}Lancia Wamply usando solo le immagini pubblicate, niente codice da clonare.${NC}"
echo ""

# ── 1. Docker presente e in esecuzione ────────────────────────────────────────
log_step "Verifica Docker"

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)      log_err "Sistema non supportato: $OS (questo script è per macOS/Linux). Su Windows usa setup.ps1." ;;
esac

if ! command -v docker &>/dev/null; then
  log_warn "Docker non trovato. Installa Docker Desktop e riesegui questo script."
  if [ "$PLATFORM" = "macos" ]; then
    echo "  Download: https://www.docker.com/products/docker-desktop/"
  else
    echo "  Installazione rapida Linux:  curl -fsSL https://get.docker.com | sh"
  fi
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  log_warn "Docker è installato ma non è in esecuzione."
  if [ "$PLATFORM" = "macos" ]; then
    echo "  Avvio Docker Desktop..."
    open -a Docker || true
    echo -n "  Attendo Docker"
    for i in $(seq 1 30); do
      sleep 3; printf '.'
      docker info &>/dev/null 2>&1 && break
    done
    echo ""
  fi
  docker info &>/dev/null 2>&1 || log_err "Docker non risponde. Avvialo manualmente e riprova."
fi

DOCKER_VER=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
log_ok "Docker ${DOCKER_VER}"

# ── 2. File .env ──────────────────────────────────────────────────────────────
log_step "Configurazione .env"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    log_ok ".env creato da .env.example"
  else
    : > "$ENV_FILE"
    log_ok ".env vuoto creato (i default in compose vanno bene per la demo)"
  fi
else
  log_ok ".env già presente"
fi

# ── 3. Stato installazione ────────────────────────────────────────────────────
log_step "Stato installazione"

CONTAINERS_RUNNING=false
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "wamply-"; then
  CONTAINERS_RUNNING=true
fi

SKIP_SETUP=false

if $CONTAINERS_RUNNING; then
  log_ok "Wamply demo è già in esecuzione"
  echo ""
  echo -e "  Cosa vuoi fare?"
  echo -e "  ${BOLD}[1]${NC} Mostra URL e credenziali (avvio rapido)"
  echo -e "  ${BOLD}[2]${NC} Riavvia senza perdere i dati"
  echo -e "  ${BOLD}[3]${NC} Aggiorna le immagini (pull latest) e ricrea i container"
  echo -e "  ${BOLD}[4]${NC} Reset completo — CANCELLA il database e ricomincia"
  echo ""
  RUNNING_CHOICE=$(ask_choice "Scelta" "1")
  case "$RUNNING_CHOICE" in
    2)
      compose restart
      log_ok "Servizi riavviati"
      SKIP_SETUP=true
      ;;
    3)
      log_step "Pull immagini più recenti"
      compose pull
      log_step "Ricreo i container"
      compose up -d --force-recreate
      ;;
    4)
      log_warn "Reset completo: tutti i dati del database e dei volumi verranno eliminati."
      CONFIRM=$(ask "Digita 'reset' per confermare" "")
      [ "$CONFIRM" != "reset" ] && { echo "  Annullato."; exit 0; }
      compose down -v
      ;;
    *)
      SKIP_SETUP=true
      ;;
  esac
else
  log_ok "Demo non in esecuzione — verrà avviata"
fi

# ── 4. Pull + avvio ───────────────────────────────────────────────────────────
if ! $SKIP_SETUP; then
  log_step "Scarico le immagini Wamply (potrebbe richiedere qualche minuto la prima volta)"
  compose pull

  log_step "Avvio dei servizi"
  compose up -d
fi

# ── 5. Health check ───────────────────────────────────────────────────────────
if ! $SKIP_SETUP; then
  log_step "Attendo che i servizi siano pronti"
  printf "  Kong API Gateway"
  READY=false
  for i in $(seq 1 60); do
    sleep 3; printf '.'
    if curl -sf "http://localhost:8100/api/v1/health" &>/dev/null; then
      READY=true; break
    fi
  done
  echo ""
  if $READY; then
    log_ok "Tutti i servizi sono pronti"
  else
    log_warn "Kong non risponde ancora — i servizi si stanno ancora avviando, attendi ancora qualche secondo"
  fi
fi

# ── 6. Riepilogo finale ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅  Wamply demo è in esecuzione!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  🌐 Frontend:       ${BOLD}http://localhost:3000${NC}"
echo -e "  🛡️  Admin panel:   ${BOLD}http://localhost:3000/admin${NC}"
echo -e "  📧 Email (demo):   ${BOLD}http://localhost:8025${NC}  (Mailhog)"
echo -e "  📊 Redis UI:       ${BOLD}http://localhost:8001${NC}"
echo ""
echo -e "  ┌─ Credenziali demo ─────────────────────────────────────┐"
echo -e "  │  Admin:  ${BOLD}admin@wcm.local${NC}   /  ${BOLD}Admin123!${NC}            │"
echo -e "  │  User 1: ${BOLD}user1@test.local${NC}  /  ${BOLD}User123!${NC}             │"
echo -e "  │  User 2: ${BOLD}user2@test.local${NC}  /  ${BOLD}User123!${NC}             │"
echo -e "  └────────────────────────────────────────────────────────┘"
echo ""
echo -e "  ${YELLOW}${BOLD}Configurazione integrazioni esterne${NC}"
echo -e "  ${YELLOW}Tutte le credenziali si configurano dal pannello admin (cifrate in DB):${NC}"
echo -e "  ${YELLOW}→ Twilio WhatsApp:  /admin  →  tab \"Twilio\"${NC}"
echo -e "  ${YELLOW}→ Stripe Pagamenti: /admin  →  tab \"Pagamenti\"${NC}"
echo -e "  ${YELLOW}→ Claude API Key:   /admin  →  tab \"Claude API\"${NC}"
echo ""
echo -e "  Comandi utili (dalla cartella della demo):"
echo -e "  ${CYAN}docker compose -f docker-compose.demo.yml down${NC}             — ferma tutti i container"
echo -e "  ${CYAN}docker compose -f docker-compose.demo.yml logs -f${NC}          — log in tempo reale"
echo -e "  ${CYAN}./setup.sh${NC}                                              — riapri questo menù"
echo ""
