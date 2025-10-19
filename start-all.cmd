@echo off
REM One-shot: start Docker stack, then open Cloudflare tunnel and dashboard
setlocal

set PORT=3001
set DASH=https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard

echo [i] Starting Docker stack...
docker compose up -d --build
if errorlevel 1 (
  echo [x] Docker compose failed.
  exit /b 1
)

echo [i] Checking API health at http://localhost:%PORT%/health
REM Optional quick wait
for /l %%i in (1,1,10) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:%PORT%/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
  if not errorlevel 1 goto :HEALTH_OK
  timeout /t 1 >nul
)
echo [!] Health not ready yet, continuing anyway.
goto :TUNNEL

:HEALTH_OK
echo [✓] API healthy.

:TUNNEL
echo [i] Launching tunnel and opening dashboard...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tunnel.ps1" -Port %PORT% -Dashboard "%DASH%"

endlocal
exit /b %ERRORLEVEL%

