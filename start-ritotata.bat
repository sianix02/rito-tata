@echo off
title RITO^&TATA — Project Launcher
color 0A

echo.
echo  ==========================================
echo   RITO^&TATA Grocery Store — Auto Launcher
echo  ==========================================
echo.

:: ── STEP 1: Start Laragon (opens Laragon which starts Apache + MySQL) ──
echo  [1/4] Starting Laragon (Apache + MySQL)...
start "" "C:\laragon\laragon.exe"
timeout /t 6 /nobreak >nul
echo  [1/4] Laragon launched

:: ── STEP 2: Wait for Apache + MySQL to fully initialize ──────────
echo  [2/4] Waiting for services to be ready...
timeout /t 6 /nobreak >nul
echo  [2/4] Services ready

:: ── STEP 3: Start Node.js SSE Server ─────────────────────────────
echo  [3/4] Starting Node.js SSE Server...
start "RITO-TATA SSE Server" cmd /k "cd /d C:\laragon\www\rito-tata\sse-server && node server.js"
timeout /t 3 /nobreak >nul
echo  [3/4] Node.js SSE Server running on port 3001

:: ── STEP 4: Open the site in browser ─────────────────────────────
echo  [4/4] Opening http://rito-tata.test ...
timeout /t 2 /nobreak >nul
start "" "http://rito-tata.test"

echo.
echo  ==========================================
echo   All done!
echo   Site:  http://rito-tata.test
echo   SSE:   http://localhost:3001/health
echo  ==========================================
echo.
echo  Keep the SSE Server window open!
echo  Press any key to close this launcher...
pause >nul
