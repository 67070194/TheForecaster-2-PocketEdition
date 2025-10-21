@echo off
REM ========================================
REM The Forecaster 2 - Pocket Edition
REM Production Mode Launcher
REM ========================================
REM
REM Purpose: Start production environment with remote access
REM
REM What it does:
REM 1. Builds and starts full Docker stack (db + server + nginx + backup)
REM 2. Waits for backend to be ready (health check)
REM 3. Starts Cloudflare tunnel for remote access to local backend
REM
REM Features:
REM - Production-optimized nginx build (~50MB, gzip, caching)
REM - Remote access via Cloudflare tunnel
REM - Allows GitHub Pages to connect to local backend
REM - Full stack testing before deployment
REM
REM Services Started:
REM - Database (PostgreSQL/TimescaleDB): localhost:5432
REM - Backend API (Express): http://localhost:3001
REM - Frontend Prod (Nginx): http://localhost:8080
REM - Backup Service: Automated pg_dump every 24h
REM - Cloudflare Tunnel: forecaster-api -> tfct_2_api.hcn.in.net
REM
REM Usage:
REM   commands\prod-start.cmd
REM
REM To Stop:
REM   commands\prod-stop.cmd

setlocal

REM ========================================
REM Configuration
REM ========================================
REM Backend API port (default: 3001)
set PORT=3001
REM GitHub Pages dashboard URL (frontend deployment)
set DASH=https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard

echo ========================================
echo   PRODUCTION MODE
echo ========================================
echo.
echo Starting production environment...
echo  [1] Docker (database + backend + nginx production build)
echo  [2] Cloudflare tunnel (GitHub Pages remote access)
echo.

REM ========================================
REM Step 1: Build and Start Docker Stack
REM ========================================
REM Builds all services with production optimizations:
REM - web: Multi-stage Dockerfile (node build + nginx serve)
REM - server: Express backend with MQTT subscription
REM - db: TimescaleDB with 8-hour retention policy
REM - backup: Daily pg_dump scheduler
echo [1/2] Starting Docker services...
docker compose up -d --build
if errorlevel 1 (
  echo [x] Docker compose failed.
  exit /b 1
)
echo [✓] Docker services started
echo.

REM ========================================
REM Step 2: Wait for Backend Server
REM ========================================
REM Backend initialization steps:
REM 1. Connect to PostgreSQL/TimescaleDB
REM 2. Subscribe to MQTT broker (HiveMQ)
REM 3. Start Express HTTP server on port 3001
echo [i] Waiting for backend server to be ready...
timeout /t 3 >nul

REM Health check: Poll /health endpoint up to 15 times (30 seconds)
REM /health endpoint returns:
REM { "ok": true, "db": true, "timestamp": 1234567890 }
echo [i] Checking backend health...
for /l %%i in (1,1,15) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:%PORT%/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto :BACKEND_READY
  timeout /t 2 >nul
)
echo [!] Backend not responding yet, but continuing...
goto :START_TUNNEL

:BACKEND_READY
echo [✓] Backend server is ready at http://localhost:%PORT%
echo.

REM ========================================
REM Step 3: Start Cloudflare Tunnel
REM ========================================
REM Tunnel Purpose:
REM - Exposes local backend API to internet
REM - Allows GitHub Pages (static site) to connect to local backend
REM - Named tunnel: forecaster-api -> tfct_2_api.hcn.in.net
REM
REM Requirements:
REM - cloudflared CLI installed
REM - Tunnel configured: cloudflared tunnel create forecaster-api
REM - DNS configured: cloudflared tunnel route dns forecaster-api tfct_2_api.hcn.in.net
REM - Credentials in ~/.cloudflared/ (automatic after tunnel creation)
:START_TUNNEL
echo [2/2] Starting Cloudflare tunnel...
echo [i] This allows GitHub Pages to connect to your local backend
timeout /t 2 >nul
REM Opens new terminal window with tunnel process
REM Tunnel runs continuously until window is closed or prod-stop.cmd is run
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel run forecaster-api"
echo [✓] Cloudflare tunnel starting (forecaster-api)...
echo.

REM ========================================
REM Production Mode Ready - Summary
REM ========================================
timeout /t 3 >nul
echo.
echo ========================================
echo   PRODUCTION MODE READY!
echo ========================================
echo.
echo Local Production Testing:
echo  - Website:       http://localhost:8080 (nginx production build)
echo  - Backend API:   http://localhost:%PORT%
echo  - Database:      PostgreSQL on localhost:5432
echo.
echo Remote Access (GitHub Pages):
echo  - Website:       %DASH%
echo  - Connects to:   Your local backend via Cloudflare tunnel
echo  - Tunnel:        forecaster-api -^> tfct_2_api.hcn.in.net
echo.
echo Use Cases:
echo  - Test production build locally (localhost:8080)
echo  - Allow GitHub Pages to access your local backend
echo  - Debug production issues before deploying
echo.
echo Note: Rebuild after frontend changes with: docker compose up -d --build
echo.
echo Press any key to open production build...
pause >nul
start http://localhost:8080

endlocal
exit /b 0
