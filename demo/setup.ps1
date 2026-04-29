#Requires -Version 5.1
<#
.SYNOPSIS
  Wamply — Demo standalone (Windows)
.DESCRIPTION
  Pre-requisito UNICO: Docker Desktop installato.
  NON serve git, NON serve clonare il repo Wamply: tutto vive in questa
  cartella. Le 4 immagini Wamply (frontend/backend/agent/db-seed) vengono
  scaricate da GitHub Container Registry come tutte le altre dipendenze.
.EXAMPLE
  .\setup.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile     = Join-Path $ScriptDir ".env"
$EnvExample  = Join-Path $ScriptDir ".env.example"
$ComposeFile = Join-Path $ScriptDir "docker-compose.demo.yml"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "`n  $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "  [XX] $msg" -ForegroundColor Red; exit 1 }
function Write-Sep  { Write-Host ("  " + ("─" * 56)) -ForegroundColor DarkGray }

function Invoke-Ask {
  param($Prompt, $Default = "")
  $hint = if ($Default) { " [$Default]" } else { "" }
  $val = Read-Host "  $Prompt$hint"
  if ([string]::IsNullOrWhiteSpace($val)) { return $Default }
  return $val
}

function Test-DockerRunning {
  & docker info 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

function Wait-DockerReady {
  Write-Host "  Attendo Docker Desktop" -NoNewline
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep 3
    Write-Host "." -NoNewline
    if (Test-DockerRunning) { Write-Host ""; return $true }
  }
  Write-Host ""
  return $false
}

function Test-ServiceHealth {
  try {
    $r = Invoke-WebRequest "http://localhost:8100/api/v1/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    return $r.StatusCode -eq 200
  } catch { return $false }
}

# All compose subcommands target THIS folder's compose file.
function Invoke-Compose { docker compose --file $ComposeFile @args }

# ── Banner ────────────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ██╗    ██╗ █████╗ ███╗   ███╗██████╗ ██╗  ██╗   ██╗" -ForegroundColor Cyan
Write-Host "  ██║    ██║██╔══██╗████╗ ████║██╔══██╗██║  ╚██╗ ██╔╝" -ForegroundColor Cyan
Write-Host "  ██║ █╗ ██║███████║██╔████╔██║██████╔╝██║   ╚████╔╝ " -ForegroundColor Cyan
Write-Host "  ██║███╗██║██╔══██║██║╚██╔╝██║██╔═══╝ ██║    ╚██╔╝  " -ForegroundColor Cyan
Write-Host "  ╚███╔███╔╝██║  ██║██║ ╚═╝ ██║██║     ███████╗██║   " -ForegroundColor Cyan
Write-Host "   ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚══════╝╚═╝   " -ForegroundColor Cyan
Write-Host ""
Write-Host "  [ATTENZIONE] Demo locale — non per produzione" -ForegroundColor Yellow
Write-Host "  Lancia Wamply usando solo le immagini pubblicate, niente codice da clonare." -ForegroundColor Yellow
Write-Host ""

# ── 1. Docker ─────────────────────────────────────────────────────────────────
Write-Step "Verifica Docker"

$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
  Write-Warn "Docker non trovato. Installa Docker Desktop e riesegui questo script."
  Write-Host "  Download: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-DockerRunning)) {
  Write-Warn "Docker è installato ma non è in esecuzione — avvio Docker Desktop..."
  $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerExe) {
    Start-Process $dockerExe
  } else {
    Start-Process "Docker Desktop"
  }
  if (-not (Wait-DockerReady)) {
    Write-Fail "Docker non risponde. Avvialo manualmente e poi riesegui lo script."
  }
}

$dockerVer = (docker --version) -replace "Docker version ", "" -replace ",.*", ""
Write-Ok "Docker $dockerVer"

# ── 2. File .env ──────────────────────────────────────────────────────────────
Write-Step "Configurazione .env"

if (-not (Test-Path $EnvFile)) {
  if (Test-Path $EnvExample) {
    Copy-Item $EnvExample $EnvFile
    Write-Ok ".env creato da .env.example"
  } else {
    New-Item $EnvFile -ItemType File -Force | Out-Null
    Write-Ok ".env vuoto creato (i default in compose vanno bene per la demo)"
  }
} else {
  Write-Ok ".env già presente"
}

# ── 3. Stato installazione ────────────────────────────────────────────────────
Write-Step "Stato installazione"

$containersRunning = (docker ps --format "{{.Names}}" 2>$null) -match "wamply-"

$skipSetup = $false

if ($containersRunning) {
  Write-Ok "Wamply demo è già in esecuzione"
  Write-Host ""
  Write-Host "  Cosa vuoi fare?" -ForegroundColor White
  Write-Host "  [1] Mostra URL e credenziali (nessuna azione)" -ForegroundColor White
  Write-Host "  [2] Riavvia senza perdere i dati" -ForegroundColor White
  Write-Host "  [3] Aggiorna le immagini (pull latest) e ricrea i container" -ForegroundColor White
  Write-Host "  [4] Reset completo — CANCELLA il database e ricomincia" -ForegroundColor Yellow
  Write-Host ""
  $choice = Invoke-Ask "Scelta" "1"
  switch ($choice) {
    "2" {
      Invoke-Compose restart
      Write-Ok "Servizi riavviati"
      $skipSetup = $true
    }
    "3" {
      Write-Step "Pull immagini più recenti"
      Invoke-Compose pull
      Write-Step "Ricreo i container"
      Invoke-Compose up -d --force-recreate
    }
    "4" {
      Write-Warn "Reset completo: tutti i dati verranno eliminati."
      $confirm = Invoke-Ask "Digita 'reset' per confermare"
      if ($confirm -ne "reset") { Write-Host "  Annullato."; exit 0 }
      Invoke-Compose down -v
    }
    default { $skipSetup = $true }
  }
} else {
  Write-Ok "Demo non in esecuzione — verrà avviata"
}

# ── 4. Pull + avvio ───────────────────────────────────────────────────────────
if (-not $skipSetup) {
  Write-Step "Scarico le immagini Wamply (potrebbe richiedere qualche minuto la prima volta)"
  Invoke-Compose pull

  Write-Step "Avvio dei servizi"
  Invoke-Compose up -d
}

# ── 5. Health check ───────────────────────────────────────────────────────────
if (-not $skipSetup) {
  Write-Step "Attendo che i servizi siano pronti"
  Write-Host "  Kong API Gateway" -NoNewline
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 3; Write-Host "." -NoNewline
    if (Test-ServiceHealth) { $ready = $true; break }
  }
  Write-Host ""
  if ($ready) { Write-Ok "Tutti i servizi sono pronti" }
  else { Write-Warn "Kong non risponde ancora — riprova tra qualche secondo" }
}

# ── 6. Riepilogo finale ───────────────────────────────────────────────────────
Write-Host ""
Write-Sep
Write-Host "  [OK]  Wamply demo è in esecuzione!" -ForegroundColor Green
Write-Sep
Write-Host ""
Write-Host "  Frontend:      http://localhost:3000" -ForegroundColor White
Write-Host "  Admin panel:   http://localhost:3000/admin" -ForegroundColor White
Write-Host "  Email (demo):  http://localhost:8025  (Mailhog)" -ForegroundColor White
Write-Host "  Redis UI:      http://localhost:8001" -ForegroundColor White
Write-Host ""
Write-Host "  Credenziali demo:" -ForegroundColor Cyan
Write-Host "    Admin:  admin@wcm.local  /  Admin123!" -ForegroundColor White
Write-Host "    User 1: user1@test.local /  User123!" -ForegroundColor White
Write-Host "    User 2: user2@test.local /  User123!" -ForegroundColor White
Write-Host ""
Write-Host "  [!] Configurazione integrazioni esterne" -ForegroundColor Yellow
Write-Host "  Tutte le credenziali si configurano dal pannello admin (cifrate in DB):" -ForegroundColor Yellow
Write-Host "    Twilio WhatsApp:  /admin  -->  tab 'Twilio'" -ForegroundColor Yellow
Write-Host "    Stripe Pagamenti: /admin  -->  tab 'Pagamenti'" -ForegroundColor Yellow
Write-Host "    Claude API Key:   /admin  -->  tab 'Claude API'" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Comandi utili (dalla cartella demo, PowerShell):" -ForegroundColor DarkGray
Write-Host "    docker compose -f docker-compose.demo.yml down       - ferma tutto" -ForegroundColor DarkGray
Write-Host "    docker compose -f docker-compose.demo.yml logs -f    - log in tempo reale" -ForegroundColor DarkGray
Write-Host "    .\setup.ps1                                          - riapri questo menù" -ForegroundColor DarkGray
Write-Host ""
