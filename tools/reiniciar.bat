@echo off
rem Desliga e liga o B.A.R. novamente.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" reiniciar
pause
