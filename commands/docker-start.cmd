@echo off
REM Start Docker services (database + backend server)
REM Displays access URLs after startup
setlocal

echo [i] Starting Docker services...
docker compose up -d

if errorlevel 1 (
  echo [x] Docker compose failed.
  exit /b 1
)

echo.
echo [✓] Docker services started successfully!
echo.
echo Wait 1-2 minutes for services to fully initialize.
echo.

REM Get local IPv4 address
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i IPv4 ^| findstr /v 127.0.0.1') do (
  for /f "delims= " %%B in ("%%A") do (
    echo Backend API accessible at:
    echo - http://localhost:3001
    echo - http://%%B:3001
    echo.
    goto :DONE
  )
)

:DONE
echo Production website (nginx) accessible at:
echo - http://localhost:8080
echo.

endlocal
exit /b 0
