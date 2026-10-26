@echo off
title WhatsApp Automation Suite
echo ===================================================
echo     Launching WhatsApp Automation Desktop App
echo ===================================================
cd /d "%~dp0"

:: Start the Next.js production server in background
start /B npm start

:: Wait 3 seconds for server to initialize
timeout /t 3 /nobreak >nul

:: Try to launch in Chrome App Mode (clean desktop window without address bar)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000
) else (
    start "" http://localhost:3000
)

echo App is running at http://localhost:3000
