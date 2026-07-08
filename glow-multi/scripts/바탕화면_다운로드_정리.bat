@echo off
chcp 65001 >nul
echo 바탕화면 + 다운로드 정리 중...
powershell -ExecutionPolicy Bypass -File "%~dp0organize-files.ps1"
pause
