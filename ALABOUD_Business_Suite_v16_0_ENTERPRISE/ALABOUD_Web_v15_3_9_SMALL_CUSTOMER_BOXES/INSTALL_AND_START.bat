@echo off
setlocal
cd /d "%~dp0"
title AlAboud Business Suite Ultimate v7.0.1

echo =============================================
echo AlAboud Business Suite Ultimate v7.0.1
echo First installation and start
echo =============================================

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

echo Using official npm registry...
call npm config set registry https://registry.npmjs.org/

if exist "backend\node_modules" rmdir /s /q "backend\node_modules"
if exist "frontend\node_modules" rmdir /s /q "frontend\node_modules"

echo.
echo [1/3] Installing backend packages...
call npm --prefix backend install --registry=https://registry.npmjs.org/ --no-audit --no-fund
if errorlevel 1 goto :error

echo.
echo [2/3] Installing frontend packages...
call npm --prefix frontend install --registry=https://registry.npmjs.org/ --no-audit --no-fund
if errorlevel 1 goto :error

echo.
echo [3/3] Building frontend...
call npm --prefix frontend run build
if errorlevel 1 goto :error

echo.
echo Starting AlAboud system...
start "AlAboud Server" cmd /k "cd /d %~dp0backend && npm start"
timeout /t 4 /nobreak >nul
start "" http://localhost:5000
exit /b 0

:error
echo.
echo Installation failed.
echo Check your internet connection, then run this file again.
pause
exit /b 1
