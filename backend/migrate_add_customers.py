#!/usr/bin/env python3
"""
Migration script to add Customer management system
- Creates customers table
- Creates customer_notes table
- Creates customer_payments table
- Updates sales table with customer linking fields
- Migrates existing sales with phone numbers to create customer records
"""
import sqlite3
import os
from datetime import datetime

db_path = os.path.join(os.path.dirname(__file__), "pos.db")

print("🔧 Adding Customer Management System...")
print(f"   Database: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # =====================
    # 1. Create customers table
    # =====================
    print("\n📋 Creating customers table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id VARCHAR UNIQUE,
            phone VARCHAR UNIQUE,
            email VARCHAR UNIQUE,
            name VARCHAR,
            address VARCHAR,
            total_purchases INTEGER DEFAULT 0,
            total_spent REAL DEFAULT 0.0,
            outstanding_balance REAL DEFAULT 0.0,
            member_since DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("✅ customers table created/verified")
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_customers_phone ON customers(phone)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_customers_customer_id ON customers(customer_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_customers_created_at ON customers(created_at)")
    print("✅ customers indexes created")
    
    # =====================
    # 2. Create customer_notes table
    # =====================
    print("\n📋 Creating customer_notes table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customer_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            note_type VARCHAR DEFAULT 'general',
            note_text VARCHAR NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )
    """)
    print("✅ customer_notes table created/verified")
    
    # =====================
    # 3. Create customer_payments table
    # =====================
    print("\n📋 Creating customer_payments table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customer_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            payment_method VARCHAR DEFAULT 'cash',
            payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            reference_note VARCHAR,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )
    """)
    print("✅ customer_payments table created/verified")
    
    # =====================
    # 4. Update sales table with customer linking fields
    # =====================
    print("\n📋 Updating sales table...")
    
    cursor.execute("PRAGMA table_info(sales)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if "customer_ref_id" not in columns:
        cursor.execute("ALTER TABLE sales ADD COLUMN customer_ref_id INTEGER REFERENCES customers(id)")
        print("✅ Added customer_ref_id column to sales")
    else:
        print("ℹ️  customer_ref_id column already exists")
    
    if "is_walkin" not in columns:
        cursor.execute("ALTER TABLE sales ADD COLUMN is_walkin BOOLEAN DEFAULT 1")
        print("✅ Added is_walkin column to sales")
    else:
        print("ℹ️  is_walkin column already exists")
    
    # Create index for customer_ref_id
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_sales_customer_ref_id ON sales(customer_ref_id)")
    print("✅ sales indexes created")
    
    # =====================
    # 5. Migrate existing sales with phone numbers
    # =====================
    print("\n📋 Migrating existing sales with phone numbers...")
    
    # Find all unique phone numbers from sales
    cursor.execute("""
        SELECT DISTINCT customer_phone, customer_name 
        FROM sales 
        WHERE customer_phone IS NOT NULL AND customer_phone != ''
    """)
    unique_phones = cursor.fetchall()
    
    customer_counter = 1
    phone_to_customer_id = {}
    
    for phone, name in unique_phones:
        # Check if customer already exists
        cursor.execute("SELECT id FROM customers WHERE phone = ?", (phone,))
        existing = cursor.fetchone()
        
        if existing:
            phone_to_customer_id[phone] = existing[0]
            print(f"   ℹ️  Customer for phone {phone} already exists")
        else:
            # Create new customer
            customer_id_str = f"CUST{customer_counter:04d}"
            now = datetime.utcnow().isoformat()
            
            # Calculate totals from existing sales
            cursor.execute("""
                SELECT COUNT(*), COALESCE(SUM(total), 0), COALESCE(SUM(amount_due), 0)
                FROM sales 
                WHERE customer_phone = ?
            """, (phone,))
            stats = cursor.fetchone()
            total_purchases = stats[0] or 0
            total_spent = stats[1] or 0.0
            outstanding = stats[2] or 0.0
            
            cursor.execute("""
                INSERT INTO customers (customer_id, phone, name, total_purchases, total_spent, outstanding_balance, member_since, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (customer_id_str, phone, name, total_purchases, total_spent, outstanding, now, now, now))
            
            new_customer_id = cursor.lastrowid
            phone_to_customer_id[phone] = new_customer_id
            
            print(f"   ✅ Created customer {customer_id_str} for phone {phone}")
            customer_counter += 1
    
    # =====================
    # 6. Link existing sales to customers
    # =====================
    print("\n📋 Linking existing sales to customers...")
    
    for phone, customer_id in phone_to_customer_id.items():
        cursor.execute("""
            UPDATE sales 
            SET customer_ref_id = ?, is_walkin = 0
            WHERE customer_phone = ?
        """, (customer_id, phone))
        updated = cursor.rowcount
        print(f"   ✅ Linked {updated} sales to customer (phone: {phone})")
    
    # Mark sales without phone as walk-in
    cursor.execute("""
        UPDATE sales 
        SET is_walkin = 1 
        WHERE customer_phone IS NULL OR customer_phone = ''
    """)
    walkin_count = cursor.rowcount
    print(f"   ✅ Marked {walkin_count} sales as walk-in customers")
    
    conn.commit()
    
    # =====================
    # Summary
    # =====================
    print("\n" + "="*50)
    print("✨ Migration completed successfully!")
    print("="*50)
    
    cursor.execute("SELECT COUNT(*) FROM customers")
    customer_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM sales WHERE customer_ref_id IS NOT NULL")
    linked_sales = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM sales WHERE is_walkin = 1")
    walkin_sales = cursor.fetchone()[0]
    
    print(f"\n📊 Summary:")
    print(f"   - Total customers created: {customer_count}")
    print(f"   - Sales linked to customers: {linked_sales}")
    print(f"   - Walk-in sales: {walkin_sales}")
    
except Exception as e:
    conn.rollback()
    print(f"\n❌ Migration failed: {str(e)}")
    raise
finally:
    conn.close()
