@echo off
setlocal
rem Roda os testes de API, mundo e integracao. Com "navegador" tambem roda os E2E (Edge): testar.bat navegador
rem Os testes usam portas e banco proprios; nao mexem nos dados do bar de desenvolvimento.
cd /d "%~dp0.."
call npm.cmd test
set "BAR_EXIT_CODE=%ERRORLEVEL%"
if not "%BAR_EXIT_CODE%"=="0" goto resultado
if /I not "%~1"=="navegador" goto resultado
call npm.cmd run test:e2e
set "BAR_EXIT_CODE=%ERRORLEVEL%"
:resultado
echo.
if "%BAR_EXIT_CODE%"=="0" (echo Todos os testes passaram.) else (echo Algum teste falhou. Veja a saida acima.)
set "BAR_PAUSA=1"
if /I "%~1"=="--sem-pausa" set "BAR_PAUSA="
if /I "%~2"=="--sem-pausa" set "BAR_PAUSA="
if defined BAR_PAUSA pause
exit /b %BAR_EXIT_CODE%
