"""
VibePOS — PostgreSQL Network Discovery
Scans the local network for PostgreSQL instances and reports their IP and port.
Call discover_and_configure() before importing any SQLAlchemy modules so the
engine is built with the correct DATABASE_URL.
"""

import os
import re
import socket
import ipaddress
import struct
import concurrent.futures
from pathlib import Path
from typing import Optional

POSTGRES_PORT = 5432
SCAN_TIMEOUT = 0.5      # seconds per host for TCP probe
MAX_WORKERS = 256       # concurrent threads


# ── helpers ──────────────────────────────────────────────────────────────────

def get_local_network() -> tuple[str, str]:
    """Return (local_ip, network_cidr) e.g. ('192.168.1.10', '192.168.1.0/24')."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to actually connect — just determines the outbound interface
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
    finally:
        s.close()

    # Assume /24 subnet (covers most home/office LANs)
    network = ipaddress.IPv4Network(local_ip + "/24", strict=False)
    return local_ip, str(network)


def tcp_probe(host: str, port: int) -> bool:
    """Return True if the TCP port is open on host."""
    try:
        with socket.create_connection((host, port), timeout=SCAN_TIMEOUT):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def verify_postgres(host: str, port: int) -> Optional[str]:
    """
    Send a PostgreSQL startup probe and check the server response.
    Returns the server version string if confirmed, else None.
    """
    try:
        with socket.create_connection((host, port), timeout=SCAN_TIMEOUT) as s:
            # Minimal PostgreSQL startup message (protocol 3.0, no auth)
            # Format: Int32(length) Int32(protocol) String(user\0) \0
            user = b"postgres"
            payload = b"user\x00" + user + b"\x00\x00"
            proto = struct.pack("!I", 196608)           # 3 << 16
            length = struct.pack("!I", 4 + 4 + len(payload))
            s.sendall(length + proto + payload)

            response = s.recv(128)
            # PostgreSQL responds with 'R' (AuthRequest), 'E' (Error), or 'N' (SSL deny)
            # Any of these confirms it IS PostgreSQL
            if response and response[0:1] in (b"R", b"E", b"N"):
                return f"port {port} — confirmed PostgreSQL"
    except Exception:
        pass
    return None


# ── scanner ──────────────────────────────────────────────────────────────────

def scan_host(host: str) -> Optional[dict]:
    """Probe a single host. Returns result dict if PostgreSQL found, else None."""
    host_str = str(host)
    if tcp_probe(host_str, POSTGRES_PORT):
        verdict = verify_postgres(host_str, POSTGRES_PORT)
        if verdict:
            return {"ip": host_str, "port": POSTGRES_PORT, "status": verdict}
        else:
            # Port open but couldn't confirm — still report it
            return {"ip": host_str, "port": POSTGRES_PORT, "status": "port open (unconfirmed)"}
    return None


def discover():
    local_ip, network_cidr = get_local_network()
    network = ipaddress.IPv4Network(network_cidr)
    hosts = list(network.hosts())          # excludes network + broadcast
    total = len(hosts)

    print(f"\n  VibePOS — PostgreSQL Discovery")
    print(f"  {'─' * 40}")
    print(f"  Local IP   : {local_ip}")
    print(f"  Scanning   : {network_cidr}  ({total} hosts, port {POSTGRES_PORT})")
    print(f"  {'─' * 40}\n")

    found = []
    scanned = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(scan_host, h): h for h in hosts}
        for future in concurrent.futures.as_completed(futures):
            scanned += 1
            print(f"\r  Progress: {scanned}/{total}", end="", flush=True)
            result = future.result()
            if result:
                found.append(result)

    print(f"\r  Progress: {total}/{total} — done.          \n")

    if found:
        print(f"  Found {len(found)} PostgreSQL instance(s):\n")
        for r in found:
            print(f"    ✓  {r['ip']}:{r['port']}  —  {r['status']}")
            print(f"       Connection string:")
            print(f"       postgresql://admin:admin123@{r['ip']}:{r['port']}/vibepos\n")
    else:
        print("  No PostgreSQL instances found on the local network.")
        print("  Make sure the server is running and port 5432 is not firewalled.\n")

    return found


if __name__ == "__main__":
    discover()


# ── auto-configure ────────────────────────────────────────────────────────────

# Default credentials written to connection strings (match docker-compose.yml)
_PG_USER = "admin"
_PG_PASS = "admin123"
_PG_DB   = "vibepos"


def _build_url(ip: str, port: int) -> str:
    return f"postgresql://{_PG_USER}:{_PG_PASS}@{ip}:{port}/{_PG_DB}"


def _write_env(env_path: Path, database_url: str) -> None:
    """Insert or update DATABASE_URL in the .env file."""
    if env_path.exists():
        content = env_path.read_text()
        if re.search(r"^DATABASE_URL\s*=", content, re.MULTILINE):
            content = re.sub(
                r"^DATABASE_URL\s*=.*$",
                f"DATABASE_URL={database_url}",
                content,
                flags=re.MULTILINE,
            )
        else:
            content = content.rstrip("\n") + f"\nDATABASE_URL={database_url}\n"
    else:
        content = f"DATABASE_URL={database_url}\n"

    env_path.write_text(content)
    print(f"  ✅ .env updated: DATABASE_URL={database_url}")


def discover_and_configure(env_path: Optional[Path] = None) -> Optional[str]:
    """
    Scan the LAN for PostgreSQL, pick the first confirmed instance, set
    DATABASE_URL in the process environment and persist it to .env.

    Returns the DATABASE_URL string if a server was found, else None
    (caller should fall back to SQLite).

    Call this BEFORE importing app.db.session so the SQLAlchemy engine
    is created with the correct URL.
    """
    print("\n  🔍 Scanning local network for PostgreSQL…")
    found = discover()

    if not found:
        print("  ⚠️  No PostgreSQL found — falling back to SQLite.\n")
        return None

    # Pick first confirmed, else first open-port result
    confirmed = [r for r in found if "confirmed" in r["status"]]
    chosen = confirmed[0] if confirmed else found[0]

    url = _build_url(chosen["ip"], chosen["port"])
    print(f"\n  🐘 Connecting to PostgreSQL at {chosen['ip']}:{chosen['port']}")

    # 1. Set in current process (must happen before importing session.py / config.py reload)
    os.environ["DATABASE_URL"] = url

    # 2. Persist to .env so subsequent runs skip the scan
    if env_path is None:
        env_path = Path(__file__).parent / ".env"
    _write_env(env_path, url)

    return url
