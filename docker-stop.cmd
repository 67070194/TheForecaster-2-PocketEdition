@echo off
REM Stop Docker services (no volume removal)
docker compose down

if errorlevel 1 (
  echo [x] Docker compose down failed.
  exit /b %errorlevel%
)

echo [✓] Docker services stopped.
exit /b 0
