@echo off
REM Stop all fullstack local development services
setlocal

echo [i] Stopping fullstack development environment...
echo.

REM Stop Docker services
echo [1/2] Stopping Docker services...
docker compose down
if errorlevel 1 (
  echo [!] Docker compose down failed or no containers running
) else (
  echo [✓] Docker services stopped
)

echo.
echo [2/2] Stopping frontend dev server...
REM Kill any node process running vite (frontend dev server)
taskkill /FI "WINDOWTITLE eq Frontend Dev Server*" /T /F >nul 2>&1
if not errorlevel 1 (
  echo [✓] Frontend dev server stopped
) else (
  echo [!] No frontend dev server found or already stopped
)

echo.
echo [✓] Fullstack stopped successfully!

endlocal
exit /b 0
