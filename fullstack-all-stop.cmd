@echo off
REM Stop all fullstack-all services
setlocal

echo ========================================
echo   STOPPING ALL SERVICES
echo ========================================
echo.

REM Stop Cloudflare tunnel
echo [1/2] Stopping Cloudflare tunnel...
taskkill /FI "WINDOWTITLE eq Cloudflare Tunnel*" /T /F >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
if not errorlevel 1 (
  echo [✓] Cloudflare tunnel stopped
) else (
  echo [!] No tunnel found or already stopped
)

REM Stop Docker services
echo.
echo [2/2] Stopping Docker services...
docker compose down
if errorlevel 1 (
  echo [!] Docker compose down failed or no containers running
) else (
  echo [✓] Docker services stopped
)

echo.
echo ========================================
echo   ALL SERVICES STOPPED!
echo ========================================
echo.

endlocal
exit /b 0
