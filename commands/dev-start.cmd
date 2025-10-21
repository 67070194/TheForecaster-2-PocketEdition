@echo off
REM ========================================
REM The Forecaster 2 - Pocket Edition
REM Development Mode Launcher
REM ========================================
REM
REM Purpose: Start local development environment with hot reload
REM
REM What it does:
REM 1. Starts Docker services (database + backend server)
REM 2. Waits for backend to be ready (health check)
REM 3. Opens Vite dev server on port 8081 (hot reload enabled)
REM
REM Features:
REM - Instant code changes (hot module replacement)
REM - Fast development workflow
REM - Local only (no remote access)
REM
REM Services Started:
REM - Database (PostgreSQL/TimescaleDB): localhost:5432
REM - Backend API (Express): http://localhost:3001
REM - Frontend Dev (Vite): http://localhost:8081
REM
REM Usage:
REM   commands\dev-start.cmd
REM
REM To Stop:
REM   commands\dev-stop.cmd

setlocal

echo ========================================
echo   DEVELOPMENT MODE
echo ========================================
echo.
echo Starting local development environment...
echo.

REM ========================================
REM Step 1: Start Docker Services
REM ========================================
REM Starts database and backend server containers
REM Uses docker-compose.yml configuration
echo [1/2] Starting Docker services...
docker compose up -d
if errorlevel 1 (
  echo [x] Docker compose failed.
  exit /b 1
)
echo [✓] Docker services started

REM ========================================
REM Step 2: Wait for Backend Server
REM ========================================
REM Backend needs time to:
REM - Connect to database
REM - Subscribe to MQTT broker
REM - Start Express HTTP server
echo.
echo [i] Waiting for backend server to be ready...
timeout /t 3 >nul

REM Health check: Poll /health endpoint up to 15 times (30 seconds)
echo [i] Checking backend health...
for /l %%i in (1,1,15) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:3001/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto :BACKEND_READY
  timeout /t 2 >nul
)
echo [!] Backend not responding yet, but continuing...
goto :START_FRONTEND

:BACKEND_READY
echo [✓] Backend server is ready

REM ========================================
REM Step 3: Start Vite Dev Server
REM ========================================
REM Opens new terminal window with Vite dev server
REM - Port 8081 (configurable in vite.config.ts)
REM - Hot Module Replacement (HMR) enabled
REM - Proxies /api, /health, /fw to backend
:START_FRONTEND
echo.
echo [2/2] Starting frontend dev server...
cd website
start "Frontend Dev Server" cmd /k "npm run dev"
cd ..

REM ========================================
REM Development Mode Ready
REM ========================================
echo.
echo ========================================
echo   DEVELOPMENT MODE READY!
echo ========================================
echo.
echo Local Services:
echo - Frontend Dev: http://localhost:8081 (Vite - hot reload)
echo - Backend API:  http://localhost:3001
echo - Database:     PostgreSQL on localhost:5432
echo.
echo Development Features:
echo - Instant code changes (hot reload)
echo - Fast development workflow
echo - Local only (no remote access)
echo.
echo Press any key to open the dev server in your browser...
pause >nul
start http://localhost:8081

endlocal
exit /b 0
