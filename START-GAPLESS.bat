@echo off
cd /d "%~dp0"
title Gapless
echo.
echo === Gapless ===
if not exist node_modules (
  echo First run: installing dependencies, 1-2 minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install FAILED. Take a screenshot of this window and send it to Claude.
    pause
    exit /b 1
  )
)
echo.
echo Starting... your browser will open at http://localhost:5173
echo Keep this window open while you use the app. Close it to stop.
echo.
call npx vite --open
pause
