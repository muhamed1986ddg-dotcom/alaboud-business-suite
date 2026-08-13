@echo off
setlocal
cd /d "%~dp0"
title AlAboud Business Suite v25.14.76

if not exist "backend\node_modules" (
  echo Dependencies are not installed. Run INSTALL_AND_START.bat first.
  pause
  exit /b 1
)

if not exist "backend\public\index.html" (
  echo Production frontend is missing. Run INSTALL_AND_START.bat first.
  pause
  exit /b 1
)

start "AlAboud Server v25.14.76" cmd /k "cd /d %~dp0 && npm start"
timeout /t 3 /nobreak >nul
start "" http://localhost:5000
