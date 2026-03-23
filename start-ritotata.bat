@echo off
title RITO^&TATA — Project Launcher
color 0A

echo.
echo  ==========================================
echo   RITO^&TATA Grocery Store — Auto Launcher
echo  ==========================================
echo.

:: ── STEP 1: Start Laragon GUI ─────────────────────────────────────
echo  [1/4] Starting Laragon...
start "" "C:\laragon\laragon.exe"
timeout /t 2 /nobreak >nul
echo  [1/4] Laragon launched

:: ── STEP 2: Start Apache (background, no new window) ────────────
echo  [2/4] Starting Apache...
start /B /D "C:\laragon\bin\apache\httpd-2.4.54-win64-VS16\bin" "" httpd.exe
timeout /t 2 /nobreak >nul
echo  [2/4] Apache started

:: ── STEP 3: Start MySQL (background, no new window) ─────────────
echo  [3/4] Starting MySQL...
start /B /D "C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin" "" mysqld.exe --defaults-file="C:\laragon\bin\mysql\mysql-8.0.30-winx64\my.ini"
timeout /t 2 /nobreak >nul
echo  [3/4] MySQL started

:: ── Wait until MySQL port 3306 is ready ───────────────────────────
echo  Waiting for MySQL to be ready...
:WAIT_MYSQL
powershell -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 3306); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto WAIT_MYSQL
)
echo  MySQL ready!

:: ── Wait until Apache port 80 is ready ───────────────────────────
echo  Waiting for Apache to be ready...
:WAIT_APACHE
powershell -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 80); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto WAIT_APACHE
)
echo  Apache ready!

:: ── Open site in browser ──────────────────────────────────────────
start "" "http://rito-tata.test"

:: ── STEP 4: SSE Server runs IN this window (no new terminal) ─────
echo  [4/4] Starting SSE Server...
echo.
echo  ==========================================
echo   All services running!
echo   Site:   http://rito-tata.test
echo   SSE:    http://localhost:3001/health
echo   Close this window to stop SSE Server.
echo  ==========================================
echo.
title RITO^&TATA — SSE Server
cd /d C:\laragon\www\rito-tata\sse-server
node server.js