@echo off
setlocal
if "%~1"=="" exit /b 64
if not "%~2"=="" exit /b 64
if defined LAUNCHDECK_NODE (
  "%LAUNCHDECK_NODE%" "%~dp0launcher.js" --request-base64 "%~1"
) else (
  node "%~dp0launcher.js" --request-base64 "%~1"
)
exit /b %ERRORLEVEL%
