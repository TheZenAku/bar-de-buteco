@echo off
setlocal
rem Cria as contas de demonstracao (admin@bar.local, jogador1@bar.local, jogador2@bar.local).
rem O PostgreSQL embutido aceita um processo por vez: os servicos sao parados antes e ligados depois.
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" parar
call npm.cmd run seed -w @bar/api
set "BAR_EXIT_CODE=%ERRORLEVEL%"
if "%BAR_EXIT_CODE%"=="0" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" iniciar
if /I not "%~1"=="--sem-pausa" pause
exit /b %BAR_EXIT_CODE%
