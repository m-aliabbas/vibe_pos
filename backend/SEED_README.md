# Product Seeding Scripts

This directory contains scripts to populate the database with dummy products for testing.

## Files

1. **seed_products.py** - Main seeding script that adds dummy products to the database
2. **import_products_csv.py** - Script to import products from CSV file
3. **dummy_products.csv** - Sample CSV file with product data

## Usage

### Method 1: Run the Seeding Script

```bash
python seed_products.py
```

This will add:
- **5 Simple Products** (no variations):
  - Fresh Eggs
  - Mineral Water
  - Basmati Rice
  - Cooking Oil
  - Bread

- **4 Products with Variations**:
  - Cotton T-Shirt (Size × Color: 6 variations)
  - Running Shoes (Size: 6 variations)
  - Mobile Phone Case (Model × Color: 4 variations)
  - Coffee Beans (Roast Level × Origin: 5 variations)

### Method 2: Import from CSV

```bash
python import_products_csv.py dummy_products.csv
```

## Product Details

### Simple Products
- Have fixed prices
- Support multiple selling units (piece, dozen, kg, etc.)
- No size/color/model variations

### Products with Variations
- Each variation has unique attributes
- Each variation has its own SKU and price adjustment
- Variations can have different quantities

Example:
```
Cotton T-Shirt
├── Size: S, Color: Red (TSH-S-RED) - 20 units
├── Size: S, Color: Blue (TSH-S-BLUE) - 15 units
├── Size: M, Color: Red (TSH-M-RED) - 25 units
├── Size: M, Color: Blue (TSH-M-BLUE) - 20 units
├── Size: L, Color: Red (TSH-L-RED) - 18 units + $1.00 adjustment
└── Size: L, Color: Blue (TSH-L-BLUE) - 16 units + $1.00 adjustment
```

## Categories Included

- Dairy & Eggs
- Beverages
- Grains
- Oils & Condiments
- Bakery
- Clothing
- Footwear
- Electronics

## Testing the Data

After running the seed script, you can test with:

1. **View all products**: GET `/api/v1/products/`
2. **Search products**: GET `/api/v1/products/search?query=coffee`
3. **Get product details**: GET `/api/v1/products/{id}`
4. **Add to cart**: POST `/sales` with product variations

## Notes

- The script checks if products already exist (by SKU) to avoid duplicates
- Quantities in the CSV for variation products are the sum of all variations
- Selling units are stored as JSON arrays
- All prices are in USD (adjust as needed for your currency)
