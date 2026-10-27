@echo off
setlocal
rem Para os servicos, instala as dependencias do package-lock, confere os tipos e liga tudo de novo.
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" parar
echo.
echo Instalando dependencias...
call npm.cmd install
if errorlevel 1 goto falhou
echo.
echo Conferindo o codigo (typecheck)...
call npm.cmd run typecheck
if errorlevel 1 goto falhou
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" iniciar
set "BAR_EXIT_CODE=%ERRORLEVEL%"
goto fim
:falhou
set "BAR_EXIT_CODE=1"
echo.
echo A atualizacao falhou. Os servicos continuam desligados; corrija o erro acima e rode iniciar.bat.
:fim
if /I not "%~1"=="--sem-pausa" pause
exit /b %BAR_EXIT_CODE%
