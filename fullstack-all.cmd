@echo off
REM Start EVERYTHING: Docker + Frontend Dev + Cloudflare Tunnel
REM - Local dev server (localhost:5173) for real-time debugging
REM - GitHub Pages (github.io) connects via tunnel for production testing
setlocal

set PORT=3001
set DASH=https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard

echo ========================================
echo   FULLSTACK ALL - Complete Environment
echo ========================================
echo.
echo Starting:
echo  [1] Docker (database + backend)
echo  [2] Frontend dev server (localhost:5173)
echo  [3] Cloudflare tunnel (for GitHub Pages)
echo.

REM ==========================================
REM Step 1: Start Docker services
REM ==========================================
echo [1/3] Starting Docker services...
docker compose up -d
if errorlevel 1 (
  echo [x] Docker compose failed.
  exit /b 1
)
echo [✓] Docker services started
echo.

REM ==========================================
REM Step 2: Wait for backend to be ready
REM ==========================================
echo [i] Waiting for backend server to be ready...
timeout /t 3 >nul

for /l %%i in (1,1,15) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:%PORT%/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto :BACKEND_READY
  timeout /t 2 >nul
)
echo [!] Backend not responding yet, but continuing...
goto :START_FRONTEND

:BACKEND_READY
echo [✓] Backend server is ready at http://localhost:%PORT%
echo.

REM ==========================================
REM Step 3: Start frontend dev server
REM ==========================================
:START_FRONTEND
echo [2/3] Starting frontend dev server...
cd website
start "Frontend Dev Server" cmd /k "npm run dev"
cd ..
echo [✓] Frontend dev server starting at http://localhost:5173
echo.

REM ==========================================
REM Step 4: Start Cloudflare tunnel
REM ==========================================
echo [3/3] Starting Cloudflare tunnel...
echo [i] This allows GitHub Pages to connect to your local backend
timeout /t 2 >nul
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:%PORT%"
echo [✓] Cloudflare tunnel starting...
echo.

REM ==========================================
REM Summary
REM ==========================================
timeout /t 3 >nul
echo.
echo ========================================
echo   ALL SERVICES STARTED!
echo ========================================
echo.
echo Local Development:
echo  - Frontend Dev:  http://localhost:5173 (Hot reload enabled)
echo  - Backend API:   http://localhost:%PORT%
echo  - Production:    http://localhost:8080 (nginx)
echo  - Database:      PostgreSQL on localhost:5432
echo.
echo GitHub Pages Production:
echo  - Website:       %DASH%
echo  - Connects to:   Your local backend via Cloudflare tunnel
echo.
echo Open Windows:
echo  [1] Frontend Dev Server (localhost:5173)
echo  [2] Cloudflare Tunnel (copy the *.trycloudflare.com URL if needed)
echo.
echo Tips:
echo  - Edit code and see changes instantly at localhost:5173
echo  - Test production version at github.io
echo  - Both connect to same local backend/database
echo.
echo Press any key to open local dev server...
pause >nul
start http://localhost:5173

endlocal
exit /b 0
