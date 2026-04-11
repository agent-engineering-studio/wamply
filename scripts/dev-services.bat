@echo off
REM ============================================================
REM  Wamply - Start infrastructure containers only
REM  (DB, Redis, Auth, PostgREST, Kong)
REM
REM  Run frontend, backend, agent locally for debugging.
REM ============================================================

echo [1/3] Stopping app containers (frontend, backend, agent)...
docker compose stop frontend backend agent 2>nul

echo [2/3] Starting infrastructure containers...
docker compose up -d supabase-db redis supabase-auth supabase-rest supabase-kong

echo [3/3] Waiting for services to be healthy...
timeout /nobreak 10 >nul

echo.
echo ========================================================
echo   Infrastructure ready!
echo.
echo   PostgreSQL:   localhost:5432
echo   Redis Stack:  localhost:6379 (RedisInsight: localhost:8001)
echo   GoTrue Auth:  localhost:9999
echo   PostgREST:    localhost:3001
echo   Kong Gateway: localhost:8100
echo.
echo   Now start the apps locally:
echo.
echo   Backend:  cd backend ^& uvicorn src.main:app --reload --port 8200
echo   Agent:    cd agent ^& uvicorn src.main:app --reload --port 8000
echo   Frontend: cd frontend ^& npm run dev
echo ========================================================
