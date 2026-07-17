@echo off
cd /d "%~dp0"
if not exist "backend\node_modules" (
  echo The system is not installed yet.
  echo Run INSTALL_AND_START.bat first.
  pause
  exit /b 1
)
start "AlAboud Server" cmd /k "cd /d %~dp0backend && npm start"
timeout /t 3 /nobreak >nul
start "" http://localhost:5000
