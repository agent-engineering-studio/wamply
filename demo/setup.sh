#!/usr/bin/env bash
# =============================================================================
#  Wamply — Demo setup (macOS / Linux)
#  USO LOCALE / DEMO ONLY — non per produzione
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${ROOT_DIR}/.env"

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

ask_secret() {
  local prompt="$1"
  read -r -s -p "  $(echo -e "${CYAN}${prompt}: ${NC}")" val
  echo "" >&2
  echo "$val"
}

ask_choice() {
  local prompt="$1" default="${2:-1}"
  read -r -p "  $(echo -e "${CYAN}${prompt} [${default}]: ${NC}")" val
  echo "${val:-$default}"
}

set_env_var() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    printf '\n%s=%s' "$key" "$val" >> "$ENV_FILE"
  fi
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
echo -e "  ${YELLOW}${BOLD}⚠️  Script per demo locale — NON usare in produzione${NC}"
echo -e "  ${YELLOW}Questo script installa e avvia Wamply sul tuo computer.${NC}"
echo ""

# ── Rilevamento OS ────────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)      log_err "Sistema non supportato: $OS" ;;
esac

# ── 1. Docker ─────────────────────────────────────────────────────────────────
log_step "Verifica Docker"

if ! command -v docker &>/dev/null; then
  log_warn "Docker non trovato — installazione in corso..."
  if [ "$PLATFORM" = "macos" ]; then
    if command -v brew &>/dev/null; then
      brew install --cask docker
      echo -e "\n  ${YELLOW}Avvia Docker Desktop dall'Applications e poi riesegui questo script.${NC}"
      exit 0
    else
      log_err "Homebrew non trovato. Installa Docker Desktop da https://www.docker.com/products/docker-desktop/"
    fi
  else
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    echo -e "\n  ${YELLOW}Docker installato. Esegui:  newgrp docker  poi riesegui lo script.${NC}"
    exit 0
  fi
fi

# Avvia Docker se non è in esecuzione
if ! docker info &>/dev/null 2>&1; then
  log_warn "Docker non è in esecuzione — tentativo di avvio..."
  if [ "$PLATFORM" = "macos" ]; then
    open -a Docker
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

# ── 2. Make ───────────────────────────────────────────────────────────────────
log_step "Verifica make"

if ! command -v make &>/dev/null; then
  log_warn "make non trovato — installazione in corso..."
  if [ "$PLATFORM" = "macos" ]; then
    xcode-select --install 2>/dev/null || brew install make
  elif command -v apt-get &>/dev/null; then
    sudo apt-get install -y make
  elif command -v yum &>/dev/null; then
    sudo yum install -y make
  else
    log_err "Impossibile installare make. Installalo manualmente."
  fi
fi
log_ok "make $(make --version | head -1 | grep -oE '[0-9]+\.[0-9]+')"

# ── 3. File .env ──────────────────────────────────────────────────────────────
log_step "Configurazione .env"

ENV_EXISTS=false
if [ -f "$ENV_FILE" ]; then
  ENV_EXISTS=true
  log_ok ".env già presente"
else
  cp "${ROOT_DIR}/.env.example" "$ENV_FILE"
  log_ok ".env creato da .env.example"
fi

# ── 4. Rilevamento stato installazione ────────────────────────────────────────
log_step "Stato installazione"

IMAGES_EXIST=false
if docker images --format '{{.Repository}}' 2>/dev/null | grep -q "wcm-\|wamply"; then
  IMAGES_EXIST=true
fi

CONTAINERS_RUNNING=false
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "wcm-"; then
  CONTAINERS_RUNNING=true
fi

if $CONTAINERS_RUNNING; then
  log_ok "Wamply è già in esecuzione"
  echo ""
  echo -e "  Cosa vuoi fare?"
  echo -e "  ${BOLD}[1]${NC} Mostra URL e credenziali (avvio rapido)"
  echo -e "  ${BOLD}[2]${NC} Riavvia senza perdere i dati  (docker compose restart)"
  echo -e "  ${BOLD}[3]${NC} Reset completo — CANCELLA il database e ricomincia"
  echo ""
  RUNNING_CHOICE=$(ask_choice "Scelta" "1")
  case "$RUNNING_CHOICE" in
    2)
      cd "$ROOT_DIR"
      docker compose restart
      log_ok "Servizi riavviati"
      ;;
    3)
      log_warn "Reset completo: tutti i dati del database verranno eliminati."
      CONFIRM=$(ask "Digita 'reset' per confermare" "")
      [ "$CONFIRM" != "reset" ] && { echo "  Annullato."; exit 0; }
      IMAGES_EXIST=false  # force full rebuild
      ;;
    *)
      # solo mostra riepilogo
      SKIP_SETUP=true
      ;;
  esac
elif $IMAGES_EXIST; then
  log_ok "Immagini Docker trovate — riavvio senza rebuild"
  echo ""
  echo -e "  Cosa vuoi fare?"
  echo -e "  ${BOLD}[1]${NC} Avvia con i dati esistenti  (make up)"
  echo -e "  ${BOLD}[2]${NC} Reset completo — CANCELLA il database e ricomincia"
  echo ""
  IMG_CHOICE=$(ask_choice "Scelta" "1")
  [ "$IMG_CHOICE" = "2" ] && IMAGES_EXIST=false
else
  log_ok "Prima installazione — verrà eseguito il build completo"
fi

SKIP_SETUP="${SKIP_SETUP:-false}"

# ── 5. Twilio (solo se nuovo setup o reset) ───────────────────────────────────
if ! $SKIP_SETUP; then
  log_step "Configurazione Twilio WhatsApp"

  TWILIO_CONFIGURED=false
  if grep -qE "^TWILIO_ACCOUNT_SID=AC[0-9a-f]{32}$" "$ENV_FILE" 2>/dev/null; then
    TWILIO_CONFIGURED=true
    log_ok "Credenziali Twilio già configurate in .env"
  fi

  if ! $TWILIO_CONFIGURED; then
    echo ""
    echo -e "  ${BOLD}[1]${NC} Sandbox / Test  — nessuna credenziale reale, nessun messaggio inviato"
    echo -e "  ${BOLD}[2]${NC} Produzione       — inserisci le tue credenziali Twilio"
    echo ""
    TWILIO_CHOICE=$(ask_choice "Modalità Twilio" "1")

    if [ "$TWILIO_CHOICE" = "2" ]; then
      echo ""
      TWILIO_SID=$(ask "Account SID (inizia con AC)")
      TWILIO_TOKEN=$(ask_secret "Auth Token")
      TWILIO_FROM=$(ask "Numero FROM WhatsApp (es. whatsapp:+391234567890)" "whatsapp:+14155238886")
      TWILIO_MSG_SID=$(ask "Messaging Service SID (lascia vuoto se non ce l'hai)" "")

      set_env_var "TWILIO_ACCOUNT_SID"  "$TWILIO_SID"
      set_env_var "TWILIO_AUTH_TOKEN"   "$TWILIO_TOKEN"
      set_env_var "TWILIO_FROM"         "$TWILIO_FROM"
      [ -n "$TWILIO_MSG_SID" ] && set_env_var "TWILIO_MESSAGING_SERVICE_SID" "$TWILIO_MSG_SID"
      log_ok "Credenziali Twilio produzione salvate"
    else
      log_ok "Modalità sandbox — i placeholder nel .env verranno usati"
      log_warn "Per inviare messaggi reali: aggiorna le credenziali in .env e riavvia"
    fi
  fi

  # ── 6. Build e avvio ─────────────────────────────────────────────────────────
  log_step "Build e avvio servizi"

  cd "$ROOT_DIR"

  if $IMAGES_EXIST; then
    # Immagini già presenti: avvio senza rebuild né pull
    log_ok "Avvio con immagini esistenti (nessun pull/build)"
    make up
  else
    # Prima installazione o reset completo
    echo -e "  ${YELLOW}Il build iniziale può richiedere 5-10 minuti (dipende dalla connessione).${NC}"
    echo -e "  ${YELLOW}I build successivi saranno molto più rapidi grazie alla cache Docker.${NC}\n"
    make setup
  fi
fi

# ── 7. Health check ───────────────────────────────────────────────────────────
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
    log_warn "Kong non risponde ancora — i servizi si stanno ancora avviando, riprova tra qualche secondo"
  fi
fi

# ── 8. Riepilogo finale ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅  Wamply è in esecuzione!${NC}"
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
echo -e "  ${YELLOW}${BOLD}Claude API Key${NC}"
echo -e "  ${YELLOW}La chiave Anthropic si configura nell'admin panel:${NC}"
echo -e "  ${YELLOW}→ http://localhost:3000/admin  →  tab \"Claude API\"${NC}"
echo ""
echo -e "  Comandi utili (dalla root del progetto):"
echo -e "  ${CYAN}make down${NC}   — ferma tutti i container"
echo -e "  ${CYAN}make logs${NC}   — mostra i log in tempo reale"
echo -e "  ${CYAN}make up${NC}     — riavvia (senza rebuild né cancellazione dati)"
echo ""
