@echo off
REM ============================================================
REM  Wamply - Start everything for local debugging
REM
REM  1. Starts infrastructure containers (DB, Redis, Auth, Kong)
REM  2. Opens 3 new terminals for backend, agent, frontend
REM
REM  Each app runs locally with hot-reload for debugging.
REM  Set breakpoints in VS Code, use debugpy, etc.
REM ============================================================

echo [1/4] Starting infrastructure containers...
call "%~dp0dev-services.bat"

echo.
echo [2/4] Starting Backend API in new terminal...
start "Wamply Backend" cmd /k "%~dp0dev-backend.bat"

echo [3/4] Starting Agent in new terminal...
start "Wamply Agent" cmd /k "%~dp0dev-agent.bat"

echo [4/4] Starting Frontend in new terminal...
start "Wamply Frontend" cmd /k "%~dp0dev-frontend.bat"

echo.
echo ========================================================
echo   All services starting in separate terminals!
echo.
echo   Frontend:    http://localhost:3000
echo   Backend API: http://localhost:8200/health
echo   Agent:       http://localhost:8000/health
echo   Kong:        http://localhost:8100
echo   RedisInsight: http://localhost:8001
echo.
echo   Close this window when done. App terminals stay open.
echo ========================================================
pause
