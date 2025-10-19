@echo off
REM Reset the database: remove volumes, then start fresh
docker compose down -v
if errorlevel 1 exit /b %errorlevel%
echo Reset Database.
exit /b %errorlevel%

