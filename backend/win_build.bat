@echo off
setlocal enabledelayedexpansion

REM ===== Paths =====
set BACKEND_DIR=%cd%
set ENTRY=%BACKEND_DIR%\run_server.py
set NAME=backend-server
set REQ_FILE=%BACKEND_DIR%\win_requirements.txt

set TAURI_BIN_DIR=..\frontend\src-tauri\bin
set TARGET_EXE=%TAURI_BIN_DIR%\backend-server-x86_64-pc-windows-msvc.exe

set K1_FILE=%BACKEND_DIR%\k1.json.enc
set TARGET_K1=%TAURI_BIN_DIR%\k1.json.enc

echo 📌 Backend dir: %BACKEND_DIR%
python --version

REM ===== Sanity check =====
if not exist "%K1_FILE%" (
  echo ❌ Missing file: %K1_FILE%
  pause
  exit /b 1
)

REM ===== Install requirements =====
echo 📦 Installing requirements...
python -m pip install -U pip setuptools wheel
python -m pip install -r "%REQ_FILE%" --no-cache-dir
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
 --add-data "%K1_FILE%;." ^
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

if errorlevel 1 (
  echo ❌ Build failed
  pause
  exit /b 1
)

echo ✅ Build successful!
echo 📍 Binary location: dist\%NAME%.exe

REM ===== Copy to Tauri sidecar =====
echo 📂 Copying to Tauri sidecar...
mkdir "%TAURI_BIN_DIR%" 2>nul

copy /Y "dist\%NAME%.exe" "%TARGET_EXE%"
copy /Y "%K1_FILE%" "%TARGET_K1%"

echo ✅ Done!
pause
