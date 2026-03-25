@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: CCNA Mastery — one-click launcher (Windows)
::
:: Double-click this file to start the app.
::
:: First run: install the PWA using the icon in Chrome/Edge's address bar.
:: After that you can skip this script and launch from the installed app icon
:: in your Start Menu or taskbar.
:: ─────────────────────────────────────────────────────────────────────────────

set PORT=8080
set URL=http://localhost:%PORT%

:: Move to the directory this script lives in
cd /d "%~dp0"

:: Kill anything already on port 8080
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% "') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Try Python 3 first, then Python 2, then npx serve
where python3 >nul 2>&1
if %errorlevel%==0 (
    start /b python3 -m http.server %PORT% --bind 127.0.0.1 >nul 2>&1
    goto :wait
)

where python >nul 2>&1
if %errorlevel%==0 (
    start /b python -m http.server %PORT% --bind 127.0.0.1 >nul 2>&1
    goto :wait
)

where npx >nul 2>&1
if %errorlevel%==0 (
    start /b npx --yes serve -l %PORT% -s . >nul 2>&1
    goto :wait
)

echo ERROR: Python 3 or Node.js (npx) is required.
echo Download Python 3 from https://www.python.org/downloads/
pause
exit /b 1

:wait
:: Give the server a moment to start
timeout /t 2 /nobreak >nul

:: Open the default browser
start "" "%URL%"

echo.
echo   CCNA Mastery is running at %URL%
echo   Close this window to stop the server.
echo.
echo   TIP: Install the PWA from your browser's address bar to skip
echo        this script on future launches.
echo.
pause
