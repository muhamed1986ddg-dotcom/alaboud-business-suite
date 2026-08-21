@echo off
setlocal
cd /d "%~dp0"
for /f "delims=" %%v in ('node -p "require('./package.json').version" 2^>nul') do set VERSION=%%v
title AlAboud Business Suite v%VERSION%

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

start "AlAboud Server v%VERSION%" cmd /k "cd /d %~dp0 && npm start"
timeout /t 3 /nobreak >nul
start "" http://localhost:5000
