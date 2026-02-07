@echo off
setlocal enabledelayedexpansion


REM ===== Paths =====
set BACKEND_DIR=%cd%
set ENTRY=%BACKEND_DIR%\run_server.py
set NAME=backend-server
set REQ_FILE=%BACKEND_DIR%\win_requirements.txt
set TARGET_DIR=..\frontend\src-tauri\bin\backend-server-x86_64-pc-windows-msvc.exe

echo 📌 Backend dir: %BACKEND_DIR%
python --version

REM ===== Install requirements =====
echo 📦 Installing requirements...
python -m pip install -U pip setuptools wheel
python -m pip install -r "%REQ_FILE%"  --no-cache-dir

python -m pip install -U protobuf


REM ===== Clean old builds =====
echo 🧹 Cleaning old builds...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist %NAME%.spec del %NAME%.spec

REM ===== Build with PyInstaller =====
echo 🔨 Building executable...

pyinstaller ^
 --name %NAME% ^
 --onefile ^
 --clean ^
 --paths "%BACKEND_DIR%" ^
 --collect-all fastapi ^
 --collect-all dotenv ^
 --collect-all starlette ^
 --collect-all uvicorn ^
 --collect-all sqlalchemy ^
 --collect-all alembic ^
 --collect-all pydantic ^
 --collect-all pydantic_settings ^
 --collect-all requests ^
 --collect-all reportlab ^
 --collect-all PIL ^
 --collect-all python_multipart ^
 --collect-all jose ^
 --collect-all passlib ^
 --collect-all cryptography ^
 --collect-all neonize ^
 --collect-all apscheduler ^
 --hidden-import=uvicorn.logging ^
 --hidden-import=uvicorn.loops.auto ^
 --hidden-import=uvicorn.protocols.http.auto ^
 --hidden-import=uvicorn.protocols.websockets.auto ^
 --hidden-import=uvicorn.lifespan.on ^
 "%ENTRY%"

echo ✅ Build successful!
echo 📍 Binary location: dist\%NAME%.exe

REM ===== Copy to Tauri sidecar =====
echo 📂 Copying to Tauri sidecar...
mkdir "..\frontend\src-tauri\bin" 2>nul
copy /Y "dist\%NAME%.exe" "%TARGET_DIR%"

echo ✅ Done!
pause