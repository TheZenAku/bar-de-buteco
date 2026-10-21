@echo off
rem Desliga o B.A.R.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" parar
pause
