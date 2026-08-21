@echo off
setlocal
cd /d "%~dp0"
for /f "delims=" %%v in ('node -p "require('./package.json').version" 2^>nul') do set VERSION=%%v
title AlAboud Business Suite v%VERSION% - Install

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 22 is required.
  pause
  exit /b 1
)

node -e "const m=Number(process.versions.node.split('.')[0]);process.exit(m===22?0:1)"
if errorlevel 1 (
  echo ERROR: This release requires Node.js 22.x.
  pause
  exit /b 1
)

echo [1/3] Installing locked dependencies...
call npm run install:all
if errorlevel 1 goto :error

echo [2/3] Running the complete release gate...
call npm test
if errorlevel 1 goto :error

echo [3/3] Building production files...
call npm run build
if errorlevel 1 goto :error

call START.bat
exit /b 0

:error
echo.
echo Installation or verification failed. The server was not started.
pause
exit /b 1
