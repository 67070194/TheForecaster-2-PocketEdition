@echo off
REM Stop the stack (no volume removal)
docker compose down
if errorlevel 1 exit /b %errorlevel%
echo Stopped containers. To reset DB (remove volumes), run: docker compose down -v
exit /b 0
