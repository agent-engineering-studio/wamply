#!/usr/bin/env bash
# ============================================================
#  Wamply - Run Frontend locally (debug mode)
# ============================================================

set -e
cd "$(dirname "$0")/../frontend"

# Override env vars to point to localhost
export NEXT_PUBLIC_SUPABASE_URL="http://localhost:8100"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export NEXT_PUBLIC_ENABLE_GOOGLE_AUTH="false"
export SUPABASE_INTERNAL_URL="http://localhost:8100"

echo "Starting Frontend on http://localhost:3000 ..."
echo "Press Ctrl+C to stop."
echo ""

npm run dev
