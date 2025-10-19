@echo off
REM Start cloudflared quick tunnel, copy Dashboard URL, and open browser
REM Usage: tunnel.cmd [PORT] [DASHBOARD_URL]
setlocal

set PORT=%1
if "%PORT%"=="" set PORT=3001
set DASH=%2
if "%DASH%"=="" set DASH=https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tunnel.ps1" -Port %PORT% -Dashboard "%DASH%"

endlocal
exit /b %ERRORLEVEL%

