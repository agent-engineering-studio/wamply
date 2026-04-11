#!/usr/bin/env bash
# ============================================================
#  Wamply - Run Backend API locally (debug mode)
# ============================================================

set -e
cd "$(dirname "$0")/../backend"

# Override env vars to point to localhost (not Docker hostnames)
export DATABASE_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres"
export REDIS_URL="redis://localhost:6379"
export JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
export AGENT_SECRET="dev-agent-secret-change-in-production"
export ENCRYPTION_KEY="0123456789abcdef0123456789abcdef"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
export STRIPE_SECRET_KEY="sk_test_xxxxx"
export STRIPE_WEBHOOK_SECRET="whsec_xxxxx"

echo "Starting Backend API on http://localhost:8200 ..."
echo "Press Ctrl+C to stop."
echo ""

uvicorn src.main:app --reload --host 0.0.0.0 --port 8200
