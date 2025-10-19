@echo off
REM Stop all running cloudflared processes (quick tunnel)
taskkill /F /IM cloudflared.exe >nul 2>&1
if errorlevel 1 (
  echo No cloudflared process found.
) else (
  echo Stopped cloudflared.
)
exit /b 0

