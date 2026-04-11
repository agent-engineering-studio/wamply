#!/usr/bin/env bash
# ============================================================
#  Wamply - Run Agent locally (debug mode)
# ============================================================

set -e
cd "$(dirname "$0")/../agent"

# Override env vars to point to localhost (not Docker hostnames)
export DATABASE_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres"
export REDIS_URL="redis://localhost:6379"
export AGENT_SECRET="dev-agent-secret-change-in-production"
export ENCRYPTION_KEY="0123456789abcdef0123456789abcdef"
export ANTHROPIC_API_KEY="sk-ant-xxxxx"
export CLAUDE_MODEL="claude-sonnet-4-20250514"
export WHATSAPP_API_URL="http://localhost:9090"
export MOCK_LLM="true"
export BACKEND_INTERNAL_URL="http://localhost:8200"

echo "Starting Agent on http://localhost:8000 ..."
echo "MOCK_LLM=true (no Claude API calls)"
echo "Press Ctrl+C to stop."
echo ""

uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
