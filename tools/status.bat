@echo off
rem Mostra se cada servico esta no ar e os enderecos de acesso.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" status
pause
