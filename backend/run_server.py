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
import shutil
import sys
from pathlib import Path
import socket
import sqlite3
import threading
import multiprocessing
import uvicorn
from dotenv import load_dotenv


def log(message: str) -> None:
    """Print status messages without letting Windows console encoding kill threads."""
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        safe = message.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(
            sys.stdout.encoding or "utf-8",
            errors="replace",
        )
        print(safe, flush=True)


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
        log(f"Loaded .env from: {env_path}")
    else:
        log(f".env not found at: {env_path} (continuing with OS env vars)")


def user_data_root() -> Path:
    """Return a writable, per-user directory that survives application upgrades."""
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "VibePOS"


def migrate_legacy_data_dir(legacy_dir: Path, data_dir: Path) -> None:
    """Copy legacy bundled runtime data once without overwriting an active database."""
    legacy_dir = legacy_dir.resolve()
    data_dir = data_dir.resolve()
    if (
        legacy_dir == data_dir
        or not legacy_dir.is_dir()
        or (data_dir / "pos.db").exists()
    ):
        return

    legacy_database = legacy_dir / "pos.db"
    if not legacy_database.exists():
        return

    log(f"Migrating legacy VibePOS data from {legacy_dir} to {data_dir}")
    data_dir.mkdir(parents=True, exist_ok=True)
    shutil.copytree(legacy_dir, data_dir, dirs_exist_ok=True)
    log("Legacy VibePOS data migration completed")


def resolve_data_dir() -> Path:
    """
    Priority:
      1) AP_DATA (if provided)
      2) DATA_DIR (from .env or OS env)
      3) default: "data" directory
    Packaged builds resolve relative paths beneath the OS user-data directory so
    installers cannot replace customer data. Development keeps its existing
    repository-relative behavior.
    """
    raw = os.environ.get("AP_DATA") or os.environ.get("DATA_DIR")
    configured_path = Path(raw).expanduser() if raw else Path("data")

    if configured_path.is_absolute():
        p = configured_path
    elif getattr(sys, "frozen", False):
        root = user_data_root().resolve()
        p = (root / configured_path).resolve()
        legacy_path = configured_path
        try:
            p.relative_to(root)
        except ValueError:
            log(f"Ignoring unsafe relative DATA_DIR outside {root}: {configured_path}")
            p = root / "data"
            legacy_path = Path("data")

        migrate_legacy_data_dir(resolve_resource_path(str(legacy_path)), p)
    else:
        p = resolve_resource_path(str(configured_path))

    p.mkdir(parents=True, exist_ok=True)
    os.environ["DATA_DIR"] = str(p.resolve())
    return Path(os.environ["DATA_DIR"])


# ---- mDNS advertisement (pos.local -> this machine, LAN-wide, zero client config) ----

LOCAL_DOMAIN = "pos.local"
LOCAL_PORT = 4321


def get_local_ip() -> str:
    """Return the machine's LAN IP (no packet actually sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def start_mdns(domain: str, ip: str, port: int) -> None:
    """
    Advertise *domain* via mDNS so every device on the LAN can resolve it
    without touching /etc/hosts or DNS settings.
    Runs in a daemon thread; stops automatically when the process exits.
    """
    try:
        from zeroconf import ServiceInfo, Zeroconf
    except ImportError:
        log("zeroconf not installed - run: pip install zeroconf")
        return

    try:
        from zeroconf import InterfaceChoice
    except ImportError:
        InterfaceChoice = None

    # Normalise: mDNS names must end with '.'
    fqdn = domain.rstrip(".") + "."
    svc_type = "_http._tcp.local."
    svc_name = f"POS.{svc_type}"

    info = ServiceInfo(
        svc_type,
        svc_name,
        addresses=[socket.inet_aton(ip)],
        port=port,
        properties={"path": "/"},
        server=fqdn,
    )

    # Windows often has several active adapters (Wi-Fi/Ethernet/VPN/Hyper-V).
    # Binding Zeroconf to one guessed IP can make the advertisement disappear,
    # so use all interfaces there and keep the explicit IP on other platforms.
    interfaces = (
        InterfaceChoice.All
        if os.name == "nt" and InterfaceChoice is not None
        else [ip]
    )

    try:
        zc = Zeroconf(interfaces=interfaces)
    except Exception as e:
        log(f"mDNS could not bind to {interfaces!r}: {e}")
        zc = Zeroconf()

    try:
        zc.register_service(info)
    except Exception as e:
        log(f"mDNS registration failed for {domain} on {ip}:{port}: {e}")
        zc.close()
        return

    log(f"mDNS: {domain} -> {ip}:{port} (visible to all LAN devices)")

    # Block this thread until the process dies (daemon=True handles cleanup)
    try:
        threading.Event().wait()
    finally:
        zc.unregister_service(info)
        zc.close()


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

# Columns added to store_settings after some clients already had the table.
# New columns for existing features must be added here so upgrades self-heal.
LEGACY_STORE_SETTINGS_COLUMNS = {
    "whatsapp_owner_number": "TEXT DEFAULT ''",
    "whatsapp_daily_report_enabled": "BOOLEAN DEFAULT 0",
    "whatsapp_daily_report_time": "TEXT DEFAULT '09:00'",
    "whatsapp_last_daily_report_date": "DATE",
    "cash_register_enabled": "BOOLEAN DEFAULT 0",
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
            log(f"Added missing products.{column}")

        if missing:
            conn.commit()
    finally:
        conn.close()


def ensure_legacy_store_settings_columns(db_path: Path) -> None:
    """
    Add columns expected by the current StoreSettings model when opening older
    SQLite DBs, so shipped clients self-upgrade without a manual migration.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='store_settings'")
        if not cur.fetchone():
            return

        cur.execute("PRAGMA table_info(store_settings)")
        existing = {row[1] for row in cur.fetchall()}

        missing = [c for c in LEGACY_STORE_SETTINGS_COLUMNS if c not in existing]
        for column in missing:
            col_sql = LEGACY_STORE_SETTINGS_COLUMNS[column]
            cur.execute(f"ALTER TABLE store_settings ADD COLUMN {column} {col_sql}")
            log(f"Added missing store_settings.{column}")

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
                log(f"DB exists but missing tables: {sorted(missing)}")
                must_create = True
        except Exception as e:
            log(f"Could not read sqlite db ({db_path}): {e}")
            must_create = True

    if must_create:
        log(f"Ensuring schema (create_all) for DB: {db_path}")
        # IMPORTANT: Import AFTER DATA_DIR is set so session/engine uses correct path
        from app.db.session import engine
        from app.db.base import Base  # should import all models
        Base.metadata.create_all(bind=engine)
        log("Schema ready")

    return db_path


if __name__ == "__main__":
    if os.name == "nt":
        multiprocessing.freeze_support()

    # 1) Load env first
    load_env_from_exe_dir()
    host = os.environ.get("AP_HOST", "0.0.0.0")
    port = int(os.environ.get("AP_PORT", "8000"))

    # 1b) Advertise pos.local on the LAN via mDNS (no client config needed)
    local_ip = get_local_ip()
    mdns_thread = threading.Thread(
        target=start_mdns,
        args=(LOCAL_DOMAIN, local_ip, LOCAL_PORT),
        daemon=True,
        name="mdns",
    )
    mdns_thread.start()

    # 2) Normalize data dir first (critical for packaged builds)
    data_dir = resolve_data_dir()

    # 3) Ensure schema exists before seeding
    db_path = ensure_schema_ready()
    ensure_legacy_product_columns(db_path)
    ensure_legacy_store_settings_columns(db_path)

    # 4) Now seed safely
    from seed import ensure_seeded
    ensure_seeded()

    log("Starting FastAPI server")
    log(f"   exe_dir:  {exe_dir()}")
    log(f"   cwd:      {Path.cwd()}")
    log(f"   host:     {host}")
    log(f"   port:     {port}")
    log(f"   LAN API:  http://{local_ip}:{port}")
    log(f"   LAN POS:  http://{local_ip}:{LOCAL_PORT}")
    log(f"   DATA_DIR: {data_dir}")
    log(f"   DB:       {db_path}")

    try:
        from app.main import app
        uvicorn.run(app, host=host, port=port, log_level="info")
    except Exception as e:
        log(f"Failed to start server: {e}")
        sys.exit(1)
