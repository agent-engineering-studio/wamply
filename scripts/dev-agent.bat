@echo off
REM ============================================================
REM  Wamply - Run Agent locally (debug mode)
REM ============================================================

cd /d "%~dp0\..\agent"

REM Override env vars to point to localhost (not Docker hostnames)
set DATABASE_URL=postgresql://supabase_admin:postgres@localhost:5432/postgres
set REDIS_URL=redis://localhost:6379
set AGENT_SECRET=dev-agent-secret-change-in-production
set ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
set ANTHROPIC_API_KEY=sk-ant-xxxxx
set CLAUDE_MODEL=claude-sonnet-4-20250514
set WHATSAPP_API_URL=http://localhost:9090
set MOCK_LLM=true
set BACKEND_INTERNAL_URL=http://localhost:8200

echo Starting Agent on http://localhost:8000 ...
echo MOCK_LLM=true (no Claude API calls)
echo Press Ctrl+C to stop.
echo.

uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
