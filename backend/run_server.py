# import os
# import sys
# from pathlib import Path
# import uvicorn
# from dotenv import load_dotenv


# def exe_dir() -> Path:
#     """Folder where the running executable lives (or this file in dev)."""
#     if getattr(sys, "frozen", False):
#         return Path(sys.executable).resolve().parent
#     return Path(__file__).resolve().parent


# def resolve_resource_path(filename: str) -> Path:
#     """
#     Resolve path to a resource file/directory.
#     - Tauri Bundle (macOS): Prioritize ../Resources/bin/{filename}
#     - Dev: same dir as script/exe
#     """
#     base = exe_dir()
    
#     # 1. Tauri Bundle (macOS) - Resources/bin/filename
#     # Executable is in Contents/MacOS/, Resources are in Contents/Resources/
#     p_bundle = base.parent / "Resources" / "bin" / Path(filename).name
#     if p_bundle.exists():
#         return p_bundle
        
#     # 2. Direct verify (Dev / Flat deployment)
#     p_direct = base / filename
#     if p_direct.exists():
#         return p_direct
        
#     # Default to direct path
#     return p_direct

# def load_env_from_exe_dir() -> None:
#     """Load .env from the same folder or resources."""
#     env_path = resolve_resource_path(".env")
#     if env_path.exists():
#         load_dotenv(env_path, override=True)
#         print(f"✅ Loaded .env from: {env_path}")
#     else:
#         print(f"⚠️ .env not found at: {env_path} (continuing with OS env vars)")


# def resolve_data_dir() -> Path:
#     """
#     Priority:
#       1) AP_DATA (if provided)
#       2) DATA_DIR (from .env or OS env)
#       3) default: "data" directory
#     Relative paths are resolved using resolve_resource_path to find bundled data.
#     """
#     # Check for explicit env var first
#     raw = os.environ.get("AP_DATA") or os.environ.get("DATA_DIR")
#     if raw:
#         p = Path(raw).expanduser()
#         if p.is_absolute():
#             # Absolute path is used as-is
#             pass
#         else:
#             # Relative path: try to find it in resources
#             p = resolve_resource_path(str(p))
#     else:
#         # Resolve 'data' directory using resource logic
#         p = resolve_resource_path("data")

#     p.mkdir(parents=True, exist_ok=True)
#     # Export absolute path so the rest of the app uses the same thing
#     os.environ["DATA_DIR"] = str(p)
#     return p


# if __name__ == "__main__":
#     from seed import ensure_seeded

#     ensure_seeded()
#     load_env_from_exe_dir()

#     port = int(os.environ.get("AP_PORT", "8000"))
#     data_dir = resolve_data_dir()

#     print(f"✅ Starting FastAPI server")
#     print(f"   exe_dir:  {exe_dir()}")
#     print(f"   cwd:      {Path.cwd()}")
#     print(f"   port:     {port}")
#     print(f"   DATA_DIR: {data_dir}")

#     try:
#         # Import after env is loaded and DATA_DIR is normalized
#         from app.main import app
#         uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
#     except Exception as e:
#         print(f"❌ Failed to start server: {e}")
#         sys.exit(1)
import os
import sys
from pathlib import Path
import sqlite3
import multiprocessing
import uvicorn
from dotenv import load_dotenv


def exe_dir() -> Path:
    """Folder where the running executable lives (or this file in dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def resolve_resource_path(filename: str) -> Path:
    """
    Resolve path to a resource file/directory.
    - Tauri Bundle (macOS): Prioritize ../Resources/bin/{filename}
    - Dev: same dir as script/exe
    """
    base = exe_dir()

    # 1) Tauri Bundle (macOS) - Resources/bin/filename
    p_bundle = base.parent / "Resources" / "bin" / Path(filename).name
    if p_bundle.exists():
        return p_bundle

    # 2) Direct verify (Dev / Flat deployment)
    p_direct = base / filename
    if p_direct.exists():
        return p_direct

    # Default to direct path
    return p_direct


def load_env_from_exe_dir() -> None:
    """Load .env from the same folder or resources."""
    env_path = resolve_resource_path(".env")
    if env_path.exists():
        load_dotenv(env_path, override=True)
        print(f"✅ Loaded .env from: {env_path}")
    else:
        print(f"⚠️ .env not found at: {env_path} (continuing with OS env vars)")


def resolve_data_dir() -> Path:
    """
    Priority:
      1) AP_DATA (if provided)
      2) DATA_DIR (from .env or OS env)
      3) default: "data" directory
    Relative paths are resolved using resolve_resource_path to find bundled data.
    """
    raw = os.environ.get("AP_DATA") or os.environ.get("DATA_DIR")
    if raw:
        p = Path(raw).expanduser()
        if not p.is_absolute():
            p = resolve_resource_path(str(p))
    else:
        p = resolve_resource_path("data")

    p.mkdir(parents=True, exist_ok=True)
    os.environ["DATA_DIR"] = str(p.resolve())
    return Path(os.environ["DATA_DIR"])


# ---- DB sanity checks ----

REQUIRED_TABLES = {
    "users",
    "customers",
    "vendors",
    "products",
    "purchases",
    "sales",
    # If your schema doesn't have some of these, remove them
    "purchase_items",
    "sale_items",
    "product_variations",
}

LEGACY_PRODUCT_COLUMNS = {
    "has_variations": "BOOLEAN DEFAULT 0",
    "variation_attributes": "TEXT DEFAULT '[]'",
    "base_unit": "TEXT DEFAULT 'piece'",
    "selling_units": "TEXT DEFAULT '[]'",
    "allow_decimal_qty": "BOOLEAN DEFAULT 0",
}


def _get_sqlite_tables(db_path: Path) -> set[str]:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
        return {r[0] for r in cur.fetchall()}
    finally:
        conn.close()


def ensure_legacy_product_columns(db_path: Path) -> None:
    """
    Add columns expected by current Product model when opening older SQLite DBs.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
        if not cur.fetchone():
            return

        cur.execute("PRAGMA table_info(products)")
        existing = {row[1] for row in cur.fetchall()}

        missing = [c for c in LEGACY_PRODUCT_COLUMNS if c not in existing]
        for column in missing:
            col_sql = LEGACY_PRODUCT_COLUMNS[column]
            cur.execute(f"ALTER TABLE products ADD COLUMN {column} {col_sql}")
            print(f"✅ Added missing products.{column}")

        if missing:
            conn.commit()
    finally:
        conn.close()


def ensure_schema_ready() -> Path:
    """
    Ensures DB file exists and core tables exist.
    - Does NOT delete data
    - If db missing/broken/empty/missing tables -> create_all()
    Returns the db path actually used.
    """
    data_dir = Path(os.environ["DATA_DIR"])
    db_path = data_dir / "pos.db"

    # If missing or empty => definitely create schema
    must_create = (not db_path.exists()) or (db_path.exists() and db_path.stat().st_size == 0)

    if not must_create:
        # Check required tables
        try:
            tables = _get_sqlite_tables(db_path)
            missing = REQUIRED_TABLES - tables
            if missing:
                print(f"⚠️ DB exists but missing tables: {sorted(missing)}")
                must_create = True
        except Exception as e:
            print(f"⚠️ Could not read sqlite db ({db_path}): {e}")
            must_create = True

    if must_create:
        print(f"🛠️ Ensuring schema (create_all) for DB: {db_path}")
        # IMPORTANT: Import AFTER DATA_DIR is set so session/engine uses correct path
        from app.db.session import engine
        from app.db.base import Base  # should import all models
        Base.metadata.create_all(bind=engine)
        print("✅ Schema ready")

    return db_path


if __name__ == "__main__":
    if os.name == "nt":
        multiprocessing.freeze_support()

    # 1) Load env first
    load_env_from_exe_dir()

    # 2) Normalize data dir first (critical for packaged builds)
    data_dir = resolve_data_dir()

    # 3) Ensure schema exists before seeding
    db_path = ensure_schema_ready()
    ensure_legacy_product_columns(db_path)

    # 4) Now seed safely
    from seed import ensure_seeded
    ensure_seeded()

    port = int(os.environ.get("AP_PORT", "8000"))

    print(f"✅ Starting FastAPI server")
    print(f"   exe_dir:  {exe_dir()}")
    print(f"   cwd:      {Path.cwd()}")
    print(f"   port:     {port}")
    print(f"   DATA_DIR: {data_dir}")
    print(f"   DB:       {db_path}")

    try:
        from app.main import app
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        sys.exit(1)
