@echo off
rem Libera as portas 5173 e 2567 no Firewall do Windows (pede administrador).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" firewall
pause
