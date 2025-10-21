@echo off
REM Production Mode - Production build testing + remote access
REM - Starts Docker with nginx production build (port 8080)
REM - Starts Cloudflare tunnel for GitHub Pages remote access
REM - For testing production builds and enabling remote connections
setlocal

set PORT=3001
set DASH=https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard

echo ========================================
echo   PRODUCTION MODE
echo ========================================
echo.
echo Starting production environment...
echo  [1] Docker (database + backend + nginx production build)
echo  [2] Cloudflare tunnel (GitHub Pages remote access)
echo.

REM ==========================================
REM Step 1: Start Docker services
REM ==========================================
echo [1/2] Starting Docker services...
docker compose up -d --build
if errorlevel 1 (
  echo [x] Docker compose failed.
  exit /b 1
)
echo [✓] Docker services started
echo.

REM ==========================================
REM Step 2: Wait for backend to be ready
REM ==========================================
echo [i] Waiting for backend server to be ready...
timeout /t 3 >nul

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

REM ==========================================
REM Step 3: Start Cloudflare tunnel
REM ==========================================
:START_TUNNEL
echo [2/2] Starting Cloudflare tunnel...
echo [i] This allows GitHub Pages to connect to your local backend
timeout /t 2 >nul
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel run forecaster-api"
echo [✓] Cloudflare tunnel starting (forecaster-api)...
echo.

REM ==========================================
REM Summary
REM ==========================================
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
