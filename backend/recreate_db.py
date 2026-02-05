#!/usr/bin/env python3
"""
Safe DB initializer / recreator

Behavior:
- If DB exists AND contains required tables => do NOTHING (keep data)
- Else => ask confirmation, then DELETE db and recreate schema + seed admin

Run: python recreate_db.py
"""
import os
import sys
import sqlite3
from dotenv import load_dotenv

load_dotenv()

# ---- Paths ----
DATA_DIR = os.getenv("DATA_DIR", "./data")
BASE_DIR = os.path.dirname(__file__)
DB_DIR = os.path.join(BASE_DIR, DATA_DIR)
DB_FILE = os.path.join(DB_DIR, "pos.db")

# ---- Required tables (adjust if you have more) ----
REQUIRED_TABLES = {
    "users",
    "customers",
    "vendors",
    "products",
    "purchases",
    "sales",
    # common extras in POS schemas; keep if you have these models
    "purchase_items",
    "sale_items",
    "product_variations",
    "returns",
    "return_items",
}

def get_sqlite_tables(db_path: str) -> set[str]:
    """Return set of table names in sqlite db. If can't read, raise."""
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
        return {row[0] for row in cur.fetchall()}
    finally:
        conn.close()

def db_has_structure(db_path: str) -> tuple[bool, str]:
    """
    Check if DB exists and contains required tables.
    Returns (ok, reason).
    """
    if not os.path.exists(db_path):
        return False, "Database file not found."

    # If file exists but is 0 bytes, it's broken/empty
    if os.path.getsize(db_path) == 0:
        return False, "Database file is empty (0 bytes)."

    try:
        tables = get_sqlite_tables(db_path)
    except Exception as e:
        return False, f"Could not open/read sqlite db: {e}"

    missing = REQUIRED_TABLES - tables
    if missing:
        return False, f"Missing required tables: {sorted(missing)}"

    return True, "DB exists and required tables are present."

def recreate_and_seed(db_path: str):
    # ensure directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    # delete existing db
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"🗑️  Deleted old database: {db_path}")

    # create schema
    from app.db.session import engine
    from app.db.base import Base  # must import all models
    Base.metadata.create_all(bind=engine)
    print("✅ Created new database with all tables")

    # seed admin
    print("\n📝 Creating admin user...")
    from app.models.user import User, UserRole
    from app.core.security import get_password_hash
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            user = User(
                username="admin",
                email="admin@example.com",
                hashed_password=get_password_hash("admin123"),
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(user)
            db.commit()
            print("✅ Admin user created (username: admin, password: admin123)")
        else:
            print("ℹ️  Admin user already exists")
    finally:
        db.close()

    print("\n✨ Database recreated successfully! You can now restart the server.")

def main():
    print(f"Database file: {DB_FILE}")

    ok, reason = db_has_structure(DB_FILE)
    if ok:
        print(f"✅ No action needed: {reason}")
        return

    print(f"⚠️  DB not ready: {reason}")
    print("⚠️  WARNING: Recreate will DELETE the existing database and all data (if any)!")
    resp = input("\n   Continue recreate? (yes/no): ").strip().lower()

    if resp != "yes":
        print("❌ Cancelled. Database not modified.")
        sys.exit(0)

    recreate_and_seed(DB_FILE)

if __name__ == "__main__":
    main()
