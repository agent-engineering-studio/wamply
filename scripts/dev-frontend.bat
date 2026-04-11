@echo off
REM ============================================================
REM  Wamply - Run Frontend locally (debug mode)
REM ============================================================

cd /d "%~dp0\..\frontend"

REM Override env vars to point to localhost
set NEXT_PUBLIC_SUPABASE_URL=http://localhost:8100
set NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
set NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false
set SUPABASE_INTERNAL_URL=http://localhost:8100

echo Starting Frontend on http://localhost:3000 ...
echo Press Ctrl+C to stop.
echo.

npm run dev
