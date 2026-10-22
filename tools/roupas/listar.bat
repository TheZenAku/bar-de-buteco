@echo off
setlocal
node "%~dp0importar.mjs" --listar
set "ROUPAS_EXIT_CODE=%ERRORLEVEL%"
if /I not "%~1"=="--sem-pausa" pause
exit /b %ROUPAS_EXIT_CODE%
