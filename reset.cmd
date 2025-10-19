@echo off
REM Reset the database: remove volumes, then start fresh
docker compose down -v
if errorlevel 1 exit /b %errorlevel%
call "%~dp0start.cmd"
exit /b %errorlevel%

