@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" logs
set "BAR_EXIT_CODE=%ERRORLEVEL%"
if not "%BAR_EXIT_CODE%"=="0" if /I not "%~1"=="--sem-pausa" pause
exit /b %BAR_EXIT_CODE%
