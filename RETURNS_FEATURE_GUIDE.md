# Product Returns/Refunds Feature - Implementation Guide

## Overview
Complete return/refund system that:
- ✅ Tracks returned items
- ✅ Automatically restocks inventory
- ✅ Updates customer balance (if they had udhar)
- ✅ Maintains audit trail
- ✅ Supports partial returns

## Backend Components Created

### 1. Database Models (`backend/app/models/return.py`)
- **Return**: Main return record
  - Links to original sale
  - Tracks reason, status, refund amount
  - Records who processed it
- **ReturnItem**: Individual returned items
  - Links to original sale item
  - Tracks quantity returned
  - Whether item was restocked

### 2. Schemas (`backend/app/schemas/return_schema.py`)
- `ReturnCreate`: Create new return
- `ReturnResponse`: Return data with details
- `ReturnItemCreate`: Item to be returned
- `ReturnItemResponse`: Returned item details

### 3. API Endpoints (`backend/app/api/v1/endpoints/returns.py`)
- `POST /api/v1/returns/` - Create a return
- `GET /api/v1/returns/` - List all returns
- `GET /api/v1/returns/{id}` - Get specific return

### 4. Routes Registered (`backend/app/api/v1/api.py`)
- Added returns router to API

### 5. Database Migration Required
Run this to create the tables:

```bash
cd backend
python3 recreate_db.py
# OR if you want to keep data:
# Add migration script to create returns and return_items tables
```

## How to Use

### Creating a Return (API Example)

```json
POST /api/v1/returns/
{
  "sale_id": 123,
  "reason": "defective",
  "notes": "Customer reported oil leaking",
  "items": [
    {
      "sale_item_id": 456,
      "quantity_returned": 2,
      "restocked": true
    }
  ],
  "refund_amount": 500.00  // Optional - auto-calculates if omitted
}
```

### Return Reasons
- `defective` - Product is defective/broken
- `wrong_item` - Wrong item shipped/sold
- `customer_changed_mind` - Customer doesn't want it
- `damaged` - Product was damaged
- `other` - Other reason (add notes)

### What Happens When Processing a Return

1. **Validation**
   - Checks sale exists
   - Verifies return quantities don't exceed original
   - Validates all sale items belong to the sale

2. **Inventory Update** (if `restocked: true`)
   - Converts returned quantity to base units
   - Adds back to product or variation stock
   - Handles unit conversions (dozen → pieces, etc.)

3. **Customer Balance Update**
   - If customer had udhar (credit), reduces outstanding balance
   - Updates customer's total_spent
   - Maintains accurate customer records

4. **Financial Tracking**
   - Records refund amount
   - Tracks original prices
   - Maintains audit trail

## Next Steps: Frontend UI

I can create a frontend page for processing returns with:
- Search for sale by ID or customer
- View sale details
- Select items to return
- Specify return reason
- Process refund

Would you like me to create the frontend UI now?

## Example Workflow

### Scenario: Customer returns 2 bottles of oil

1. **Find Original Sale**
   ```
   Sale #123 - Customer: John Doe
   Items:
   - Engine Oil 5W-30 (4 bottles) @ ₹250 each = ₹1000
   - Oil Filter (1 pc) @ ₹150 = ₹150
   Total: ₹1150
   ```

2. **Process Return**
   ```json
   {
     "sale_id": 123,
     "reason": "defective",
     "notes": "2 bottles were leaking",
     "items": [
       {
         "sale_item_id": 456,
         "quantity_returned": 2,
         "restocked": false  // Don't restock defective items
       }
     ]
   }
   ```

3. **Result**
   - Refund: ₹500 (2 × ₹250)
   - Inventory: NOT updated (restocked=false)
   - Customer balance: Reduced if they had credit
   - Return record created for audit

## Database Schema

### returns table
```sql
id (PK)
sale_id (FK → sales.id)
processed_by (FK → users.id)
reason (ENUM)
notes (TEXT)
status (ENUM: pending/approved/rejected)
subtotal (FLOAT)
refund_amount (FLOAT)
created_at (DATETIME)
updated_at (DATETIME)
```

### return_items table
```sql
id (PK)
return_id (FK → returns.id)
sale_item_id (FK → sale_items.id)
product_id (FK → products.id)
variation_id (FK → product_variations.id, nullable)
quantity_returned (INT)
unit (VARCHAR)
unit_price (FLOAT)
total_refund (FLOAT)
restocked (BOOLEAN)
```

## Benefits

✅ **Inventory Accuracy**: Auto-restocking ensures accurate stock levels
✅ **Customer Trust**: Smooth returns process improves satisfaction  
✅ **Audit Trail**: Complete record of all returns
✅ **Financial Control**: Track refunds and adjust customer balances
✅ **Flexible**: Support partial returns, various reasons
✅ **Unit Support**: Handles different units (dozen, kg, pieces)
✅ **Variation Support**: Works with product variations

## Ready to Test

After running the database migration, you can test with:

```bash
# Create a return
curl -X POST "http://localhost:8000/api/v1/returns/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sale_id": 1,
    "reason": "defective",
    "items": [{"sale_item_id": 1, "quantity_returned": 1, "restocked": true}]
  }'

# List returns
curl -X GET "http://localhost:8000/api/v1/returns/" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Let me know if you want me to create the frontend UI for returns!
