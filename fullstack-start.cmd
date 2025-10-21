@echo off
REM Start full stack locally for development
REM - Opens Docker services (database, server)
REM - Opens website dev server in browser
setlocal

echo [i] Starting fullstack development environment...
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
echo [✓] Fullstack started successfully!
echo.
echo Services:
echo - Backend API:  http://localhost:3001
echo - Frontend Dev: http://localhost:5173
echo - Database:     PostgreSQL on localhost:5432
echo.
echo Press any key to open the frontend in your browser...
pause >nul
start http://localhost:5173

endlocal
exit /b 0
