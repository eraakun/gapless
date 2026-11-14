@echo off
cd /d "%~dp0"
title Gapless check
echo Running tests...
call npm test
echo.
echo Building (same check Vercel runs)...
call npm run build
if errorlevel 1 (
  echo.
  echo ===== BUILD FAILED: screenshot this window and send it to Claude =====
) else (
  echo.
  echo ===== ALL GOOD: ready to publish =====
)
pause
