@echo off
REM ============================================================
REM  Wamply - Run Backend API locally (debug mode)
REM ============================================================

cd /d "%~dp0\..\backend"

REM Create venv if it doesn't exist
if not exist .venv (
    echo Creating Python virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate

REM Install dependencies if missing
python -c "import fastapi" 2>nul
if errorlevel 1 (
    echo Installing dependencies...
    pip install uv
    uv pip install -e ".[dev]"
)

REM Override env vars to point to localhost (not Docker hostnames)
set DATABASE_URL=postgresql://supabase_admin:postgres@localhost:5432/postgres
set REDIS_URL=redis://localhost:6379
set JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
set AGENT_SECRET=dev-agent-secret-change-in-production
set ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
set STRIPE_SECRET_KEY=sk_test_xxxxx
set STRIPE_WEBHOOK_SECRET=whsec_xxxxx

echo Starting Backend API on http://localhost:8200 ...
echo venv: %VIRTUAL_ENV%
echo Press Ctrl+C to stop.
echo.

uvicorn src.main:app --reload --host 0.0.0.0 --port 8200
