@echo off
REM Start EVERYTHING: Docker + Cloudflare Tunnel
REM - Local debugging at localhost:8080 (Docker nginx production build)
REM - GitHub Pages (github.io) connects via tunnel for remote access
setlocal

set PORT=3001
set DASH=https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard

echo ========================================
echo   FULLSTACK ALL - Complete Environment
echo ========================================
echo.
echo Starting:
echo  [1] Docker (database + backend + nginx frontend)
echo  [2] Cloudflare tunnel (for GitHub Pages access)
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
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:%PORT%"
echo [✓] Cloudflare tunnel starting...
echo.

REM ==========================================
REM Summary
REM ==========================================
timeout /t 3 >nul
echo.
echo ========================================
echo   ALL SERVICES STARTED!
echo ========================================
echo.
echo Local Debugging:
echo  - Website:       http://localhost:8080 (Docker nginx)
echo  - Backend API:   http://localhost:%PORT%
echo  - Database:      PostgreSQL on localhost:5432
echo.
echo Remote Access (GitHub Pages):
echo  - Website:       %DASH%
echo  - Connects to:   Your local backend via Cloudflare tunnel
echo.
echo Open Windows:
echo  [1] Cloudflare Tunnel (shows *.trycloudflare.com URL)
echo.
echo Tips:
echo  - Debug locally at localhost:8080
echo  - Test remotely at github.io
echo  - Both use same local backend/database
echo  - Rebuild frontend: docker compose up -d --build
echo.
echo Press any key to open local website...
pause >nul
start http://localhost:8080

endlocal
exit /b 0
