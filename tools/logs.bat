@echo off
rem Acompanha o log do servidor em tempo real (Ctrl+C para sair).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bar.ps1" logs
