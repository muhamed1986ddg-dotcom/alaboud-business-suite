\
@echo off
setlocal
set DIR=%~dp0

if exist "%DIR%gradle\wrapper\gradle-wrapper.jar" (
  java -classpath "%DIR%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
  exit /b %ERRORLEVEL%
)

where gradle >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  gradle %*
  exit /b %ERRORLEVEL%
)

echo Gradle is not installed and gradle-wrapper.jar is missing.
exit /b 1
