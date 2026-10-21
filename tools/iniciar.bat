@echo off
rem Liga o B.A.R. (API, mundo multiplayer e site) em segundo plano.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" iniciar
pause
