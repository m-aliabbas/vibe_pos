#!/usr/bin/env python3
"""
Database recreation script - USE WITH CAUTION: This will delete all data!
Run with: python recreate_db.py
"""
import os
import sys

db_path = os.path.join(os.path.dirname(__file__), "pos.db")

print("⚠️  WARNING: This will DELETE the existing database and all data!")
print(f"   Database file: {db_path}")
response = input("\n   Continue? (yes/no): ")

if response.lower() != 'yes':
    print("❌ Cancelled. Database not modified.")
    sys.exit(0)

# Delete existing database
if os.path.exists(db_path):
    os.remove(db_path)
    print(f"🗑️  Deleted old database: {db_path}")
else:
    print("ℹ️  No existing database found")

# Create new database with all tables
from app.db.session import engine
from app.db.base import Base  # This imports all models
Base.metadata.create_all(bind=engine)
print("✅ Created new database with all tables")

# Run seed script
print("\n📝 Creating admin user...")
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from app.db.session import SessionLocal

db = SessionLocal()
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
db.close()

print("\n✨ Database recreated successfully! You can now restart the server.")
