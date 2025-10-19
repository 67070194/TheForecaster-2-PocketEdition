@echo off
REM Stop the stack (no volume removal)
docker compose down
if errorlevel 1 exit /b %errorlevel%
echo Stopped containers.
exit /b 0
