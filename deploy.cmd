@echo off
REM Deploy to GitHub Pages with tunnel API endpoints
setlocal

echo [i] Deploying to GitHub Pages...
echo.

REM Build for GitHub Pages with tunnel API
echo [1/3] Building website for GitHub Pages...
cd website
call npm run build:github
if errorlevel 1 (
  echo [x] Build failed.
  cd ..
  exit /b 1
)
cd ..
echo [✓] Build complete

REM Copy to docs folder
echo.
echo [2/3] Copying build to docs folder...
if exist docs rmdir /s /q docs
xcopy /E /I /Y website\dist docs >nul
if errorlevel 1 (
  echo [x] Copy failed.
  exit /b 1
)
echo [✓] Files copied

REM Commit and push
echo.
echo [3/3] Committing and pushing to GitHub...
git add docs
git commit -m "deploy: update GitHub Pages"
if errorlevel 1 (
  echo [!] No changes to commit or commit failed.
) else (
  git push origin main
  if errorlevel 1 (
    echo [x] Push failed.
    exit /b 1
  )
  echo [✓] Deployed to GitHub Pages
)

echo.
echo [✓] Deployment complete!
echo.
echo GitHub Pages URL: https://67070194.github.io/TheForecaster-2-PocketEdition/
echo Note: Changes may take 1-2 minutes to appear
echo.

endlocal
exit /b 0
