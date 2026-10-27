@echo off
setlocal
cd /d "%~dp0"
if exist "assets\windows\AP-Chaos-Bridge.exe" (
  start "" "assets\windows\AP-Chaos-Bridge.exe"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Node.js 22 oder neuer von https://nodejs.org installieren.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22) process.exit(1)"
if errorlevel 1 (
  echo Node.js 22 oder neuer ist erforderlich.
  pause
  exit /b 1
)
if not exist "node_modules\ws\package.json" (
  echo Abhaengigkeiten fehlen. Paket vollstaendig entpacken oder npm ci ausfuehren.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1"
if errorlevel 1 pause
