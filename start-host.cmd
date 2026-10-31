@echo off
rem Bladerift - LAN host launcher for Windows (Lenovo Legion Go). Serves the game on port 7360.
rem Rebuilds whenever the sources changed, starts the authoritative game server, opens the host console.
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22 LTS is required: https://nodejs.org & pause & exit /b 1)
node tools\build-stamp.mjs node || (echo This Node.js version is too old. Install Node.js 22 LTS from https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Installing dependencies... & call npm ci || (pause & exit /b 1))
node tools\build-stamp.mjs check
if errorlevel 1 (
  echo Building the game ^(first run or after an update^)...
  call npm run build || (echo Build failed - not starting an outdated host. & pause & exit /b 1)
  node tools\build-stamp.mjs write
)
echo.
echo  Keep this window open while hosting. Players on the same Wi-Fi scan the QR code below.
echo  If Windows asks about network access, allow it on PRIVATE networks.
echo.
node packages\server\dist\server.mjs --static=packages\client\dist --open %*
pause
