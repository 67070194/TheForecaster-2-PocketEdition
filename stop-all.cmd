@echo off
setlocal

echo [i] Stopping Cloudflare tunnel...
call "%~dp0tunnel-stop.cmd"

echo [i] Stopping Docker stack...
call "%~dp0docker-stop.cmd"

endlocal
exit /b %ERRORLEVEL%

