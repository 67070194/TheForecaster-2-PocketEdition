@echo off
REM Stop all running cloudflared processes (Cloudflare tunnel)
taskkill /F /IM cloudflared.exe >nul 2>&1
if errorlevel 1 (
  echo [!] No cloudflared process found or already stopped.
) else (
  echo [✓] Cloudflare tunnel stopped.
)
exit /b 0
