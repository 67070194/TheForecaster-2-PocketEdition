@echo off
REM Development Mode - Local development with hot reload
REM - Starts Docker services (database + backend)
REM - Opens Vite dev server (port 5173) with instant code changes
REM - For coding/development only (not for production testing)
setlocal

echo ========================================
echo   DEVELOPMENT MODE
echo ========================================
echo.
echo Starting local development environment...
echo.

REM Start Docker services (database + backend server)
echo [1/2] Starting Docker services...
docker compose up -d
if errorlevel 1 (
  echo [x] Docker compose failed.
  exit /b 1
)
echo [✓] Docker services started

REM Wait for backend to be ready
echo.
echo [i] Waiting for backend server to be ready...
timeout /t 3 >nul

REM Check backend health
for /l %%i in (1,1,15) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:3001/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto :BACKEND_READY
  timeout /t 2 >nul
)
echo [!] Backend not responding yet, but continuing...
goto :START_FRONTEND

:BACKEND_READY
echo [✓] Backend server is ready

:START_FRONTEND
echo.
echo [2/2] Starting frontend dev server...
cd website
start "Frontend Dev Server" cmd /k "npm run dev"
cd ..

echo.
echo ========================================
echo   DEVELOPMENT MODE READY!
echo ========================================
echo.
echo Local Services:
echo - Frontend Dev: http://localhost:8081 (Vite - hot reload)
echo - Backend API:  http://localhost:3001
echo - Database:     PostgreSQL on localhost:5432
echo.
echo Development Features:
echo - Instant code changes (hot reload)
echo - Fast development workflow
echo - Local only (no remote access)
echo.
echo Press any key to open the dev server in your browser...
pause >nul
start http://localhost:8081

endlocal
exit /b 0
