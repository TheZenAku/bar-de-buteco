@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" reiniciar
set "BAR_EXIT_CODE=%ERRORLEVEL%"
if /I not "%~1"=="--sem-pausa" pause
exit /b %BAR_EXIT_CODE%
