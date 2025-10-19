@echo off
REM Start the stack and print access URLs
docker compose up -d
echo Wait 1-2 minutes for the website to finish running.
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i IPv4 ^| findstr /v 127.0.0.1') do (
  for /f "delims= " %%B in ("%%A") do (
    echo Open WEBSITE: http://%%B:8080  (and http://localhost:8080)
  )
)
exit /b 0
