@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 18+ ：https://nodejs.org/
  exit /b 1
)

where rustc >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Rust ：https://rustup.rs
  echo 安装完成后重新打开终端再运行本脚本。
  exit /b 1
)

echo [1/3] npm install
call npm install
if errorlevel 1 exit /b 1

echo [2/3] 生成图标
call npm run icons

echo [3/3] 打包 Windows EXE
call npm run tauri:build
if errorlevel 1 exit /b 1

echo.
echo 打包完成。请把下面这个 EXE 复制到水务工作站根目录后双击：
echo   src-tauri\target\release\水务AI聊天壳.exe
echo 安装包（可选）：
echo   src-tauri\target\release\bundle\nsis\
echo.
pause
