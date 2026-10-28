@echo off
setlocal
rem Coloca bots no bar para testar o desempenho: 30 por padrao, "bots.bat 12" coloca 12. O jogo precisa estar ligado.
rem Ctrl+C tira todos do bar.
cd /d "%~dp0.."
set "BOTS_COUNT="
set "BAR_PAUSE=1"
for %%A in (%*) do if /I "%%~A"=="--sem-pausa" (set "BAR_PAUSE=") else (set "BOTS_COUNT=%%~A")
call npm.cmd run bots -- %BOTS_COUNT%
set "BAR_EXIT_CODE=%ERRORLEVEL%"
if defined BAR_PAUSE pause
exit /b %BAR_EXIT_CODE%
