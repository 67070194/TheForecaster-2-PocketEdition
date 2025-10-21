@echo off
REM ========================================
REM The Forecaster 2 - Pocket Edition
REM Try Cloudflare (Quick Tunnel) Launcher
REM ========================================
REM
REM Purpose: Quick production testing with Cloudflare tunnel (no account/domain needed)
REM
REM What it does:
REM 1. Starts Docker services (database + backend only)
REM 2. Waits for backend to be ready
REM 3. Starts Cloudflare quick tunnel (generates temporary URL)
REM 4. Captures and displays the tunnel URL
REM 5. Opens GitHub Pages dashboard with URL parameter
REM
REM Features:
REM - No Cloudflare account required
REM - No domain setup needed
REM - Instant testing
REM - Perfect for development/testing
REM
REM Limitations:
REM - Tunnel URL changes every time you restart (e.g., https://random-name-1234.trycloudflare.com)
REM - Not suitable for production (use prod-start.cmd with named tunnel instead)
REM - URL must be manually updated in GitHub Pages dashboard each time
REM
REM Services Started:
REM - Database (PostgreSQL/TimescaleDB): localhost:5432
REM - Backend API (Express): http://localhost:3001
REM - Cloudflare Quick Tunnel: Temporary HTTPS URL -> localhost:3001
REM
REM Usage:
REM   commands\trycloudflare.cmd
REM
REM To Stop:
REM   Press Ctrl+C in the tunnel window, then run: docker compose down
REM
REM Alternative for Production:
REM   Use commands\prod-start.cmd with a named tunnel for persistent URL

setlocal enabledelayedexpansion

REM ========================================
REM Configuration
REM ========================================
set PORT=3001
set DASH=https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard
set TUNNEL_LOG=%TEMP%\cloudflared-tunnel.log

echo ========================================
echo   TRY CLOUDFLARE MODE
echo ========================================
echo.
echo Quick production testing with temporary tunnel
echo.
echo Note: Tunnel URL changes every restart!
echo For persistent URL, use prod-start.cmd instead.
echo.

REM ========================================
REM Step 1: Check if cloudflared is installed
REM ========================================
echo [i] Checking if cloudflared is installed...
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [x] cloudflared is not installed!
  echo.
  echo Please install cloudflared first:
  echo.
  echo 1. Download from: https://github.com/cloudflare/cloudflared/releases
  echo 2. Extract cloudflared.exe to a folder
  echo 3. Add that folder to your PATH environment variable
  echo.
  echo Quick install ^(run as administrator^):
  echo   winget install Cloudflare.cloudflared
  echo.
  pause
  exit /b 1
)
echo [✓] cloudflared is installed
echo.

REM ========================================
REM Step 2: Start Docker Services
REM ========================================
echo [1/3] Starting Docker services (database + backend)...
docker compose up -d db server backup
if errorlevel 1 (
  echo [x] Docker compose failed.
  echo.
  echo Troubleshooting:
  echo - Make sure Docker Desktop is running
  echo - Check .env file exists (copy from .env.example)
  echo - Try: docker compose down -v (removes all data!)
  echo.
  pause
  exit /b 1
)
echo [✓] Docker services started
echo.

REM ========================================
REM Step 3: Wait for Backend Server
REM ========================================
echo [i] Waiting for backend server to be ready...
timeout /t 5 /nobreak >nul

echo [i] Checking backend health at http://localhost:%PORT%/health...
for /l %%i in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:%PORT%/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto :BACKEND_READY
  echo    Attempt %%i/20 - Backend not ready yet, waiting...
  timeout /t 2 /nobreak >nul
)
echo [x] Backend failed to start within 40 seconds
echo.
echo Troubleshooting:
echo - Check Docker logs: docker compose logs server
echo - Verify database: docker compose logs db
echo - Try restarting: docker compose restart server
echo.
pause
exit /b 1

:BACKEND_READY
echo [✓] Backend server is ready at http://localhost:%PORT%
echo.

REM ========================================
REM Step 4: Start Cloudflare Quick Tunnel
REM ========================================
echo [2/3] Starting Cloudflare quick tunnel...
echo [i] This will generate a temporary HTTPS URL
echo.

REM Delete old log if exists
if exist "%TUNNEL_LOG%" del "%TUNNEL_LOG%"

REM Start tunnel in background and capture output
echo [i] Launching tunnel (this may take 10-15 seconds)...
start /min "Cloudflare Tunnel" cmd /c "cloudflared tunnel --url http://localhost:%PORT% > "%TUNNEL_LOG%" 2>&1"

REM Wait for tunnel URL to appear in log
echo [i] Waiting for tunnel URL...
set TUNNEL_URL=
set COUNTER=0
:WAIT_TUNNEL
timeout /t 1 /nobreak >nul
set /a COUNTER+=1

REM Check if log exists and extract URL
if exist "%TUNNEL_LOG%" (
  REM Extract URL from log using PowerShell
  for /f "delims=" %%a in ('powershell -NoProfile -Command "if (Test-Path '%TUNNEL_LOG%') { $content = Get-Content '%TUNNEL_LOG%' -Raw; if ($content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') { $matches[0] } }"') do set TUNNEL_URL=%%a

  if not "!TUNNEL_URL!"=="" goto :TUNNEL_READY
)

REM Timeout after 30 seconds
if %COUNTER% geq 30 (
  echo [x] Tunnel failed to start within 30 seconds
  echo.
  echo Troubleshooting:
  echo - Check tunnel log: type "%TUNNEL_LOG%"
  echo - Ensure cloudflared has network access
  echo - Try running manually: cloudflared tunnel --url http://localhost:%PORT%
  echo.
  pause
  exit /b 1
)

echo    Waiting for tunnel... (%COUNTER%/30)
goto :WAIT_TUNNEL

:TUNNEL_READY
echo [✓] Tunnel is ready!
echo.

REM ========================================
REM Step 5: Display Tunnel Information
REM ========================================
echo ========================================
echo   TUNNEL READY!
echo ========================================
echo.
echo Temporary Tunnel URL:
echo   !TUNNEL_URL!
echo.
echo Backend API:
echo   Local:  http://localhost:%PORT%
echo   Public: !TUNNEL_URL!
echo.
echo IMPORTANT: This URL changes every restart!
echo.

REM ========================================
REM Step 6: Configure GitHub Pages Dashboard
REM ========================================
echo [3/3] Opening GitHub Pages dashboard...
echo.
echo The dashboard will open with the tunnel URL as parameter.
echo This tells the dashboard to use your local backend.
echo.
echo Dashboard URL:
echo   %DASH%?api=!TUNNEL_URL!^&fw=!TUNNEL_URL!
echo.

timeout /t 3 /nobreak >nul

REM Open dashboard with URL parameters
start "" "%DASH%?api=!TUNNEL_URL!&fw=!TUNNEL_URL!"

echo.
echo ========================================
echo   SETUP COMPLETE
echo ========================================
echo.
echo Your local backend is now accessible at:
echo   !TUNNEL_URL!
echo.
echo GitHub Pages dashboard opened with tunnel URL parameter.
echo The parameter will be saved in browser localStorage.
echo.
echo How to use:
echo 1. Dashboard should show "Database: Online"
echo 2. If you see "Database: Offline":
echo    - Clear browser cache
echo    - Reload the page
echo    - Check URL parameters were applied
echo.
echo To test manually:
echo   !TUNNEL_URL!/health
echo   !TUNNEL_URL!/api/latest
echo.
echo WARNING: Each time you restart this script:
echo - The tunnel URL will change
echo - You must re-open the dashboard with new URL
echo - Or manually update via: %DASH%?api=NEW_URL
echo.
echo For persistent URL (recommended for production):
echo   Use commands\prod-start.cmd with named tunnel
echo.
echo Press Ctrl+C to stop the tunnel (or close tunnel window)
echo Then run: docker compose down
echo.
echo Tunnel log: %TUNNEL_LOG%
echo.

REM Keep this window open to show instructions
echo Press any key to view tunnel logs (live)...
pause >nul

REM Follow tunnel logs
echo.
echo ========================================
echo   TUNNEL LOGS (Ctrl+C to exit)
echo ========================================
echo.
powershell -NoProfile -Command "Get-Content '%TUNNEL_LOG%' -Wait"

endlocal
exit /b 0
