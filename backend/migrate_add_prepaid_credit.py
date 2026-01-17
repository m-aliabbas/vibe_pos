"""
Migration script to add prepaid_credit column to vendors table
Run this with: python migrate_add_prepaid_credit.py
"""
import sqlite3
import os

# Get the database path
db_path = os.path.join(os.path.dirname(__file__), "pos.db")

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    print("Creating database tables...")
    # If no database exists, just create it via main.py import
    from app.db.session import engine, Base
    Base.metadata.create_all(bind=engine)
    print("Database created successfully!")
else:
    # Database exists, add the column
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(vendors)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'prepaid_credit' in columns:
            print("✅ Column 'prepaid_credit' already exists in vendors table")
        else:
            # Add the column
            cursor.execute("ALTER TABLE vendors ADD COLUMN prepaid_credit REAL DEFAULT 0.0")
            conn.commit()
            print("✅ Successfully added 'prepaid_credit' column to vendors table")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        conn.close()

print("\n✨ Migration complete! You can now restart the server.")
