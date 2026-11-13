@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js，請先到 https://nodejs.org 下載安裝 LTS 版本。
  pause
  exit /b
)
if not exist node_modules (
  echo 第一次啟動，正在安裝套件...
  call npm install --omit=dev
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
