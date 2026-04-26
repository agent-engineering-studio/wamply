@echo off
:: =============================================================================
::  Wamply — Demo setup launcher (Windows CMD)
::  Avvia setup.ps1 con PowerShell — richiede Windows 10+ con PS 5.1+
:: =============================================================================

echo.
echo   Wamply Demo Setup
echo   -----------------
echo   Avvio di setup.ps1 con PowerShell...
echo.

:: Verifica che PowerShell sia disponibile
where powershell >nul 2>&1
if errorlevel 1 (
    echo   [ERRORE] PowerShell non trovato.
    echo   Installa PowerShell da: https://aka.ms/powershell
    pause
    exit /b 1
)

:: Avvia setup.ps1 con execution policy temporanea (non modifica le policy globali)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

if errorlevel 1 (
    echo.
    echo   [!!] Lo script ha restituito un errore.
    echo   Controlla i messaggi sopra per i dettagli.
    pause
    exit /b 1
)

pause
