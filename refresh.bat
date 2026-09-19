@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 18 or newer is needed to refresh. Install it from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (echo Installing tools, one time only... & call npm install --silent)
node tools\build.mjs --only pdf --report
echo.
echo Done. Reload index.html in your browser.
pause
