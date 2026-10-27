@echo off
setlocal
rem Abre o jogo no navegador padrao (o site precisa estar ligado: iniciar.bat).
if "%BAR_HTTPS%"=="0" (set "BAR_URL=http://localhost:5173") else (set "BAR_URL=https://localhost:5173")
start "" "%BAR_URL%"
echo Abrindo %BAR_URL% ...
exit /b 0
