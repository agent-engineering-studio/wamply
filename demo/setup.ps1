#Requires -Version 5.1
<#
.SYNOPSIS
  Wamply — Demo setup (Windows)
.DESCRIPTION
  Installa Docker Desktop se necessario, configura .env e avvia Wamply.
  USO LOCALE / DEMO ONLY — non per produzione.
.EXAMPLE
  .\demo\setup.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir
$EnvFile   = Join-Path $RootDir ".env"

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

function Invoke-AskSecret {
  param($Prompt)
  $sec  = Read-Host "  $Prompt" -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

function Set-EnvVar {
  param($Key, $Val)
  $raw = Get-Content $EnvFile -Raw
  if ($raw -match "(?m)^${Key}=") {
    $raw = $raw -replace "(?m)^${Key}=.*", "${Key}=${Val}"
  } else {
    $raw = $raw.TrimEnd() + "`n${Key}=${Val}"
  }
  [System.IO.File]::WriteAllText($EnvFile, $raw, [System.Text.Encoding]::UTF8)
}

# ── Config profiles ───────────────────────────────────────────────────────────
$ConfigsDir = Join-Path $ScriptDir "configs"
$ConfigVars = @("TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_FROM","TWILIO_MESSAGING_SERVICE_SID")

function Save-Config {
  param($Name)
  if (-not (Test-Path $ConfigsDir)) { New-Item -ItemType Directory $ConfigsDir | Out-Null }
  $profilePath = Join-Path $ConfigsDir "${Name}.env"
  $envContent = Get-Content $EnvFile -Raw
  $lines = @()
  foreach ($var in $ConfigVars) {
    if ($envContent -match "(?m)^${var}=(.*)") {
      $lines += "${var}=$($Matches[1])"
    }
  }
  [System.IO.File]::WriteAllText($profilePath, ($lines -join "`n") + "`n", [System.Text.Encoding]::UTF8)
  Write-Ok "Profilo '$Name' salvato in demo\configs\${Name}.env"
}

function Import-Config {
  param($Name)
  $profilePath = Join-Path $ConfigsDir "${Name}.env"
  if (-not (Test-Path $profilePath)) { Write-Warn "Profilo '$Name' non trovato"; return }
  foreach ($line in (Get-Content $profilePath)) {
    if ($line -match "^([^#=]+)=(.*)") {
      Set-EnvVar $Matches[1] $Matches[2]
    }
  }
  Write-Ok "Profilo '$Name' caricato"

  $running = (docker ps --format "{{.Names}}" 2>$null) -match "wcm-"
  if ($running) {
    Write-Host ""
    Write-Host "  Vuoi riavviare i servizi applicativi per applicare le nuove credenziali?" -ForegroundColor White
    Write-Host "  [1] Si — riavvia backend e agent" -ForegroundColor White
    Write-Host "  [2] No — riavvia manualmente" -ForegroundColor White
    $r = Invoke-Ask "Scelta" "1"
    if ($r -eq "1") {
      Set-Location $RootDir
      docker compose restart backend agent
      Write-Ok "Servizi riavviati con le nuove credenziali"
    }
  }
}

function Show-Configs {
  if (-not (Test-Path $ConfigsDir)) { Write-Host "  Nessun profilo salvato in demo\configs\" -ForegroundColor Yellow; return }
  $files = Get-ChildItem $ConfigsDir -Filter "*.env" -ErrorAction SilentlyContinue
  if (-not $files) { Write-Host "  Nessun profilo salvato in demo\configs\" -ForegroundColor Yellow; return }
  Write-Host "  Profili disponibili:" -ForegroundColor White
  foreach ($f in $files) { Write-Host "  * $($f.BaseName)" -ForegroundColor White }
}

function Open-ConfigMenu {
  Write-Host ""
  Write-Host "  Gestione configurazioni" -ForegroundColor Cyan
  Write-Host ""
  Show-Configs
  Write-Host ""
  Write-Host "  [1] Carica un profilo" -ForegroundColor White
  Write-Host "  [2] Salva configurazione attuale come profilo" -ForegroundColor White
  Write-Host "  [3] Torna al menu principale" -ForegroundColor White
  Write-Host ""
  $choice = Invoke-Ask "Scelta" "3"
  switch ($choice) {
    "1" {
      $name = Invoke-Ask "Nome profilo da caricare"
      if ($name) { Import-Config $name }
    }
    "2" {
      $name = Invoke-Ask "Nome del nuovo profilo (es. cliente-acme)"
      if ($name) { Save-Config $name }
    }
    default { Write-Host "  Annullato." }
  }
}

function Test-DockerRunning {
  $result = & docker info 2>&1
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
Write-Host "  [ATTENZIONE] Script per demo locale — NON usare in produzione" -ForegroundColor Yellow
Write-Host ""

# ── 1. Docker ─────────────────────────────────────────────────────────────────
Write-Step "Verifica Docker"

$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
  Write-Warn "Docker non trovato — installazione con winget..."
  try {
    winget install -e --id Docker.DockerDesktop `
      --accept-source-agreements --accept-package-agreements --silent
    Write-Host ""
    Write-Host "  Docker Desktop installato." -ForegroundColor Green
    Write-Host "  Aprilo dal menu Start, completa il setup iniziale," -ForegroundColor Yellow
    Write-Host "  poi riesegui questo script." -ForegroundColor Yellow
  } catch {
    Write-Fail "winget non disponibile. Scarica Docker Desktop da https://www.docker.com/products/docker-desktop/"
  }
  exit 0
}

if (-not (Test-DockerRunning)) {
  Write-Warn "Docker non è in esecuzione — avvio Docker Desktop..."
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

$EnvExists = Test-Path $EnvFile
if (-not $EnvExists) {
  Copy-Item (Join-Path $RootDir ".env.example") $EnvFile
  Write-Ok ".env creato da .env.example"
} else {
  Write-Ok ".env già presente"
}

# ── 3. Stato installazione ────────────────────────────────────────────────────
Write-Step "Stato installazione"

$imagesExist = (docker images --format "{{.Repository}}" 2>$null) -match "wcm-|wamply"
$containersRunning = (docker ps --format "{{.Names}}" 2>$null) -match "wcm-"

$skipSetup = $false

if ($containersRunning) {
  Write-Ok "Wamply è già in esecuzione"
  Write-Host ""
  Write-Host "  Cosa vuoi fare?" -ForegroundColor White
  Write-Host "  [1] Mostra URL e credenziali (nessuna azione)" -ForegroundColor White
  Write-Host "  [2] Riavvia i container senza perdere i dati" -ForegroundColor White
  Write-Host "  [3] Gestisci configurazioni / cambia Twilio" -ForegroundColor White
  Write-Host "  [4] Reset completo — CANCELLA il database e ricomincia" -ForegroundColor Yellow
  Write-Host ""
  $choice = Invoke-Ask "Scelta" "1"
  switch ($choice) {
    "2" {
      Set-Location $RootDir
      docker compose restart
      Write-Ok "Servizi riavviati"
    }
    "3" {
      Open-ConfigMenu
      $skipSetup = $true
    }
    "4" {
      Write-Warn "Reset completo: tutti i dati verranno eliminati."
      $confirm = Invoke-Ask "Digita 'reset' per confermare"
      if ($confirm -ne "reset") { Write-Host "  Annullato."; exit 0 }
      $imagesExist = $false
    }
    default { $skipSetup = $true }
  }
} elseif ($imagesExist) {
  Write-Ok "Immagini Docker trovate — riavvio senza rebuild"
  Write-Host ""
  Write-Host "  [1] Avvia con i dati esistenti  (nessun rebuild)" -ForegroundColor White
  Write-Host "  [2] Gestisci configurazioni / cambia Twilio" -ForegroundColor White
  Write-Host "  [3] Reset completo — CANCELLA il database e ricomincia" -ForegroundColor Yellow
  Write-Host ""
  $choice = Invoke-Ask "Scelta" "1"
  switch ($choice) {
    "2" { Open-ConfigMenu }
    "3" { $imagesExist = $false }
  }
} else {
  Write-Ok "Prima installazione — verrà eseguito il build completo"
}

# ── 4. Twilio ─────────────────────────────────────────────────────────────────
if (-not $skipSetup) {
  Write-Step "Configurazione Twilio WhatsApp"

  $envContent  = Get-Content $EnvFile -Raw
  $twilioOk    = $envContent -match "(?m)^TWILIO_ACCOUNT_SID=AC[0-9a-f]{32}"

  if ($twilioOk) {
    Write-Ok "Credenziali Twilio già configurate in .env"
  } else {
    Write-Host ""
    Write-Host "  [1] Sandbox / Test  — nessuna credenziale reale, nessun messaggio inviato" -ForegroundColor White
    Write-Host "  [2] Produzione       — inserisci le tue credenziali Twilio" -ForegroundColor White
    Write-Host ""
    $twilioChoice = Invoke-Ask "Modalità Twilio" "1"

    if ($twilioChoice -eq "2") {
      Write-Host ""
      $sid    = Invoke-Ask "Account SID (inizia con AC)"
      $token  = Invoke-AskSecret "Auth Token"
      $from   = Invoke-Ask "Numero FROM WhatsApp (es. whatsapp:+391234567890)" "whatsapp:+14155238886"
      $msgSid = Invoke-Ask "Messaging Service SID (lascia vuoto se non ce l'hai)" ""

      Set-EnvVar "TWILIO_ACCOUNT_SID" $sid
      Set-EnvVar "TWILIO_AUTH_TOKEN"  $token
      Set-EnvVar "TWILIO_FROM"        $from
      if (-not [string]::IsNullOrWhiteSpace($msgSid)) {
        Set-EnvVar "TWILIO_MESSAGING_SERVICE_SID" $msgSid
      }
      Write-Ok "Credenziali Twilio produzione salvate"
    } else {
      Write-Ok "Modalità sandbox — placeholder dal .env.example"
      Write-Warn "Per messaggi reali: aggiorna le credenziali in .env e riavvia"
    }
  }

  # ── 5. Build e avvio ─────────────────────────────────────────────────────────
  Write-Step "Build e avvio servizi"
  Set-Location $RootDir

  if ($imagesExist) {
    Write-Ok "Avvio con immagini esistenti (nessun pull/build)"
    docker compose up -d
  } else {
    Write-Host "  Il build iniziale puo' richiedere 5-10 minuti." -ForegroundColor Yellow
    Write-Host "  I build successivi saranno molto piu' rapidi grazie alla cache Docker.`n" -ForegroundColor Yellow

    # Equivale a: make setup (down -v + build + up + seed)
    docker compose down --remove-orphans --volumes 2>$null
    docker compose build
    docker compose up -d

    # Seed database
    Write-Host "  Attendo database..." -NoNewline
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep 3; Write-Host "." -NoNewline
      $test = docker compose exec -T supabase-db pg_isready -U postgres 2>$null
      if ($LASTEXITCODE -eq 0) { break }
    }
    Write-Host ""

    $seedFile = Join-Path $RootDir "supabase\seed.sql"
    if (Test-Path $seedFile) {
      Get-Content $seedFile -Raw | docker compose exec -T supabase-db psql -U postgres -d postgres | Out-Null
      Write-Ok "Database inizializzato e seed caricato"
    }
  }
}

# ── 6. Health check ───────────────────────────────────────────────────────────
if (-not $skipSetup) {
  Write-Step "Attendo servizi pronti"
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

# ── 7. Riepilogo finale ───────────────────────────────────────────────────────
Write-Host ""
Write-Sep
Write-Host "  [OK]  Wamply e' in esecuzione!" -ForegroundColor Green
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
Write-Host "  [!] Claude API Key" -ForegroundColor Yellow
Write-Host "  La chiave Anthropic si imposta nell'admin panel:" -ForegroundColor Yellow
Write-Host "  http://localhost:3000/admin  -->  tab 'Claude API'" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Comandi utili (PowerShell dalla root del progetto):" -ForegroundColor DarkGray
Write-Host "    docker compose down      - ferma tutto" -ForegroundColor DarkGray
Write-Host "    docker compose up -d     - riavvia (senza rebuild)" -ForegroundColor DarkGray
Write-Host "    docker compose logs -f   - log in tempo reale" -ForegroundColor DarkGray
Write-Host ""
