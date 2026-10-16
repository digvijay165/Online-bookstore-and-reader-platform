@echo off
REM Starts Online Bookstore & Reader Zone on Windows. Double-click this file.
cd /d "%~dp0"
set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Program Files\nodejs\node.exe"
if not exist node_modules\express (
  echo Installing dependencies...
  call npm install --no-fund --no-audit
)
echo Opening http://127.0.0.1:3000 ...
start "" http://127.0.0.1:3000
"%NODE%" --disable-warning=ExperimentalWarning server.js
pause
