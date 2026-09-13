#!/bin/bash
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
ENTRY="$BACKEND_DIR/run_server.py"
NAME="backend-server"
REQ_FILE="$BACKEND_DIR/requirements.txt"

TARGET_DIR="../frontend/src-tauri/bin/backend-server-aarch64-apple-darwin"

echo "📌 Backend dir: $BACKEND_DIR"
echo "📌 Using python: $(which python)"
echo "📌 Python: $(python --version)"

# 1) Install requirements into the CURRENT env (must be agent_dev)
echo "📦 Installing requirements..."
python -m pip install -U pip setuptools wheel
python -m pip install -r "$REQ_FILE"

# 2) Clean old builds
rm -rf "$BACKEND_DIR/build" "$BACKEND_DIR/dist" "$BACKEND_DIR/${NAME}.spec"

# 3) Build
# We use --collect-all for key libs to avoid runtime import misses.
pyinstaller --name "$NAME" \
  --onefile \
  --clean \
  --paths "$BACKEND_DIR" \
  \
  --collect-all fastapi \
  --collect-all dotenv \
  --collect-all starlette \
  --collect-all uvicorn \
  --collect-all sqlalchemy \
  --collect-all alembic \
  --collect-all pydantic \
  --collect-all pydantic_settings \
  --collect-all requests \
  --collect-all reportlab \
  --collect-all PIL \
  --collect-all python_multipart \
  --collect-all jose \
  --collect-all passlib \
  --collect-all bcrypt \
  --collect-all cryptography \
  --collect-all neonize \
  --collect-all apscheduler \
  --collect-all zeroconf \
  \
  --hidden-import=uvicorn.logging \
  --hidden-import=uvicorn.loops \
  --hidden-import=uvicorn.loops.auto \
  --hidden-import=uvicorn.protocols \
  --hidden-import=uvicorn.protocols.http \
  --hidden-import=uvicorn.protocols.http.auto \
  --hidden-import=uvicorn.protocols.websockets \
  --hidden-import=uvicorn.protocols.websockets.auto \
  --hidden-import=uvicorn.lifespan.on \
  --hidden-import=engineio.async_drivers.asgi \
  --hidden-import=jose \
  --hidden-import=passlib.handlers.bcrypt \
  --hidden-import=python_multipart \
  --hidden-import=PIL \
  --hidden-import=neonize \
  --hidden-import=dotenv \
  --hidden-import=apscheduler \
  \
  "$ENTRY"

echo "✅ Build successful!"
echo "📍 Binary location: $BACKEND_DIR/dist/$NAME"

# 4) Copy to Tauri sidecar directory
echo "📂 Copying to Tauri sidecar directory..."
mkdir -p "$(dirname "$TARGET_DIR")"
cp "$BACKEND_DIR/dist/$NAME" "$TARGET_DIR"
echo "✅ Copied to $TARGET_DIR"
