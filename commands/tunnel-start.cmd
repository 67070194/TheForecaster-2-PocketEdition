@echo off
REM Start Cloudflare tunnel (requires Docker services already running)
REM Usage: tunnel-start.cmd
setlocal

set PORT=3001
set DASH=https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard

echo [i] Starting Cloudflare Tunnel...
echo.

REM Check if backend is running
echo [i] Checking if backend server is running at http://localhost:%PORT%/health
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:%PORT%/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo [x] Backend server is not running!
  echo [!] Please start Docker services first using docker-start.cmd
  echo.
  pause
  exit /b 1
)

echo [✓] Backend server is ready
echo.

REM Launch tunnel
echo [i] Launching Cloudflare tunnel and opening dashboard...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tunnel.ps1" -Port %PORT% -Dashboard "%DASH%"

endlocal
exit /b %ERRORLEVEL%
