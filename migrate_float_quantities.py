import sqlite3
import os

DB_PATH = "backend/data/pos.db"

def migrate_quantities_to_float():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        print("Starting migration of quantity columns to FLOAT...")

        # 1. Products Table
        print("Migrating products table...")
        cursor.execute("PRAGMA table_info(products)")
        columns = cursor.fetchall()
        # SQLite doesn't support changing column type directly easily, but valid workaround is to trust SQLite's dynamic typing 
        # or create new table. However, since we are moving Integer -> Float, SQLite manages this gracefully if we just update the schema definition for future.
        # But to be safe and "Desi" robust, let's just make sure future inserts are floats. 
        # Actually in SQLite, types are affinity based. So updating the value to float works. 
        # But we should update the table definition if we want to be strict, but for this quick modification, 
        # we will use the trick of creating a new table and copying data if we want to be 100% schema correct, 
        # OR we can just proceed because SQLite ANY column can hold ANY data.
        # However, for robustness in SQLAlchemy reflection, we should update the schema.
        
        # Strategy:
        # A. Rename table
        # B. Create new table with REAL/FLOAT type
        # C. Copy data
        # D. Drop old table
        
        # --- PRODUCTS ---
        cursor.execute("ALTER TABLE products RENAME TO products_old")
        cursor.execute("""
            CREATE TABLE products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR,
                sku VARCHAR,
                category VARCHAR,
                description VARCHAR,
                image_url VARCHAR,
                selling_price FLOAT,
                cost_price FLOAT,
                quantity FLOAT,
                low_stock_threshold INTEGER,
                has_variations BOOLEAN,
                variation_attributes JSON,
                base_unit VARCHAR,
                selling_units JSON
            )
        """)
        cursor.execute("CREATE INDEX ix_products_name ON products (name)")
        cursor.execute("CREATE UNIQUE INDEX ix_products_sku ON products (sku)")
        cursor.execute("CREATE INDEX ix_products_category ON products (category)")
        cursor.execute("CREATE INDEX ix_products_id ON products (id)")

        cursor.execute("""
            INSERT INTO products (id, name, sku, category, description, image_url, selling_price, cost_price, quantity, low_stock_threshold, has_variations, variation_attributes, base_unit, selling_units)
            SELECT id, name, sku, category, description, image_url, selling_price, cost_price, CAST(quantity AS FLOAT), low_stock_threshold, has_variations, variation_attributes, base_unit, selling_units
            FROM products_old
        """)
        cursor.execute("DROP TABLE products_old")
        print("Products table migrated.")

        # --- PRODUCT VARIATIONS ---
        print("Migrating product_variations table...")
        cursor.execute("ALTER TABLE product_variations RENAME TO product_variations_old")
        cursor.execute("""
            CREATE TABLE product_variations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                attributes JSON NOT NULL,
                sku VARCHAR,
                price_adjustment FLOAT,
                quantity FLOAT,
                barcode VARCHAR,
                created_at VARCHAR,
                updated_at VARCHAR,
                FOREIGN KEY(product_id) REFERENCES products(id)
            )
        """)
        cursor.execute("CREATE INDEX ix_product_variations_id ON product_variations (id)")
        cursor.execute("CREATE UNIQUE INDEX ix_product_variations_sku ON product_variations (sku)")
        cursor.execute("CREATE UNIQUE INDEX ix_product_variations_barcode ON product_variations (barcode)")
        
        cursor.execute("""
            INSERT INTO product_variations (id, product_id, attributes, sku, price_adjustment, quantity, barcode, created_at, updated_at)
            SELECT id, product_id, attributes, sku, price_adjustment, CAST(quantity AS FLOAT), barcode, created_at, updated_at
            FROM product_variations_old
        """)
        cursor.execute("DROP TABLE product_variations_old")
        print("Product Variations table migrated.")

        # --- PURCHASE ITEMS ---
        print("Migrating purchase_items table...")
        cursor.execute("ALTER TABLE purchase_items RENAME TO purchase_items_old")
        cursor.execute("""
             CREATE TABLE purchase_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                purchase_id INTEGER,
                product_id INTEGER,
                variation_id INTEGER,
                quantity FLOAT,
                unit_cost FLOAT,
                total_cost FLOAT,
                expiry_date DATETIME,
                FOREIGN KEY(purchase_id) REFERENCES purchases(id),
                FOREIGN KEY(product_id) REFERENCES products(id),
                FOREIGN KEY(variation_id) REFERENCES product_variations(id)
            )
        """)
        cursor.execute("CREATE INDEX ix_purchase_items_id ON purchase_items (id)")

        cursor.execute("""
            INSERT INTO purchase_items (id, purchase_id, product_id, variation_id, quantity, unit_cost, total_cost, expiry_date)
            SELECT id, purchase_id, product_id, variation_id, CAST(quantity AS FLOAT), unit_cost, total_cost, expiry_date
            FROM purchase_items_old
        """)
        cursor.execute("DROP TABLE purchase_items_old")
        print("Purchase Items table migrated.")

        # --- SALE ITEMS ---
        print("Migrating sale_items table...")
        # Note: sale_items has triggers/logic potentially? Models don't show triggers in code but good to be careful.
        # Checking model definition again... standard fields.
        
        cursor.execute("ALTER TABLE sale_items RENAME TO sale_items_old")
        cursor.execute("""
            CREATE TABLE sale_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER,
                product_id INTEGER,
                variation_id INTEGER,
                quantity FLOAT,
                unit VARCHAR,
                unit_price FLOAT,
                item_discount FLOAT,
                total_price FLOAT,
                FOREIGN KEY(sale_id) REFERENCES sales(id),
                FOREIGN KEY(product_id) REFERENCES products(id),
                FOREIGN KEY(variation_id) REFERENCES product_variations(id)
            )
        """)
        cursor.execute("CREATE INDEX ix_sale_items_id ON sale_items (id)")

        cursor.execute("""
            INSERT INTO sale_items (id, sale_id, product_id, variation_id, quantity, unit, unit_price, item_discount, total_price)
            SELECT id, sale_id, product_id, variation_id, CAST(quantity AS FLOAT), unit, unit_price, item_discount, total_price
            FROM sale_items_old
        """)
        cursor.execute("DROP TABLE sale_items_old")
        print("Sale Items table migrated.")

        conn.commit()
        print("Migration completed successfully!")

    except Exception as e:
        print(f"An error occurred: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_quantities_to_float()
