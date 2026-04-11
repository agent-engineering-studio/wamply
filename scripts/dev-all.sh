#!/usr/bin/env bash
# ============================================================
#  Wamply - Start everything for local debugging
#
#  1. Starts infrastructure containers (DB, Redis, Auth, Kong)
#  2. Starts backend, agent, frontend in background
#
#  Each app runs locally with hot-reload for debugging.
#  Press Ctrl+C to stop all processes.
# ============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[1/4] Starting infrastructure containers..."
bash "$SCRIPT_DIR/dev-services.sh"

echo ""
echo "[2/4] Starting Backend API..."
bash "$SCRIPT_DIR/dev-backend.sh" &
BACKEND_PID=$!

echo "[3/4] Starting Agent..."
bash "$SCRIPT_DIR/dev-agent.sh" &
AGENT_PID=$!

echo "[4/4] Starting Frontend..."
bash "$SCRIPT_DIR/dev-frontend.sh" &
FRONTEND_PID=$!

echo ""
echo "========================================================"
echo "  All services running!"
echo ""
echo "  Frontend:    http://localhost:3000"
echo "  Backend API: http://localhost:8200/health"
echo "  Agent:       http://localhost:8000/health"
echo "  Kong:        http://localhost:8100"
echo "  RedisInsight: http://localhost:8001"
echo ""
echo "  Press Ctrl+C to stop all processes."
echo "========================================================"

# Trap Ctrl+C to kill all background processes
trap "echo 'Stopping all...'; kill $BACKEND_PID $AGENT_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

# Wait for any process to exit
wait
