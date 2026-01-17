# Customer Management System Plan

## 1. Cart/Checkout Integration - Customer Identification

**CRITICAL: Customers can be created with EITHER phone number OR customer_id**

### Cart/Sales Page Customer Field Logic:

**2-Level Identification:**
```
Level 1: Customer Lookup (by phone OR customer_id)
  └─ Search by phone number → find/create customer
  └─ OR search by customer_id (readable ID) → find customer
  └─ Link sale to customer
  
Level 2: Walk-in Customer (if neither provided)
  └─ No customer record created
  └─ Sale recorded as anonymous
  └─ Label as "Walk-in" in reports
```

### Implementation Details:

**Cart Page Changes:**
- Add customer search field (can accept phone OR customer_id)
- When customer data entered → search for existing customer
- If found → display customer info (name, outstanding balance, udhar)
- If not found:
  - If phone provided → create new customer with auto-generated customer_id
  - If customer_id provided → create new customer with that customer_id
- Show "Walk-in Customer" badge if no search result/no customer selected

**Customer Table Structure:**
```sql
customers:
- id (PRIMARY KEY, Auto-Increment Integer) - System internal identifier
- customer_id (UNIQUE, VARCHAR) - Human readable ID (e.g., "CUST001", "CUST002")
  └─ Auto-generated as "CUST" + zero-padded number OR user-provided
- phone (UNIQUE, VARCHAR, nullable) - Phone number, unique if provided
- name (VARCHAR, nullable) - Customer name
- email (VARCHAR, nullable)
- address (VARCHAR, nullable)
- total_purchases (INT, default 0) - Count of sales
- total_spent (DECIMAL, default 0) - Sum of sale amounts
- outstanding_balance (DECIMAL, default 0) - Credit/udhar amount
- member_since (TIMESTAMP) - Account creation date
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

**Backend Sale Model Update:**
```
Sale fields:
- customer_id (optional, nullable) - FK to customers.id
- is_walkin (boolean) - true if no customer linked
- created_by (existing user_id)
```

**Validation Logic:**
1. If phone provided:
   - Search for customer by phone (case-insensitive, trim whitespace)
   - If found → link sale to customer_id
   - If not found → create new customer with phone + auto-generate customer_id → link sale
2. If customer_id provided (and no phone):
   - Search for customer by customer_id
   - If found → link sale to customer_id
   - If not found → create new customer with customer_id (no phone) → link sale
3. If neither provided → mark as walk-in (is_walkin=true), no customer linking
4. **Customer requires at least phone OR customer_id (one of them must exist)**

---

## 2. Customer Detail Page Features

### 📊 Customer Profile
- Name, Phone, Email, Address
- Customer ID (phone or custom)
- Total purchases count
- Total amount spent
- Outstanding balance (udhar)
- Member since date

### 📝 Purchase History
- All sales linked to this customer
- Date, items, amount, payment status
- Filter by date range
- Export history

### 📌 Special Notes
- Add notes about customer preferences
- Special instructions
- Credit history notes
- Important reminders

### 💰 Financial Summary
- Total credit/udhar given
- Payment history
- Average purchase value

### ⚡ Quick Actions
- Add new sale for this customer (prefill customer)
- Record payment against udhar
- Send invoice/receipt
- Edit customer info

---

## Implementation Order:

### Phase 1: Backend
1. Create/Update Customer Model with all fields
2. Update Sale Model to include customer linking fields
3. Create migration script to:
   - Create Customer table
   - Backfill existing sales with customer phone numbers (if available)
   - Handle walk-in sales (mark with is_walkin=true)
4. Build Backend APIs:
   - `POST /customers` - Create new customer
   - `GET /customers` - List all customers
   - `GET /customers/search?phone=...` - Search by phone
   - `GET /customers/:id` - Get customer detail
   - `GET /customers/:id/purchases` - Get purchase history
   - `GET /customers/:id/financial-summary` - Credit/payment data
   - `POST /customers/:id/notes` - Add notes
   - `POST /customers/:id/record-payment` - Record payment
   - `PUT /customers/:id` - Update customer info
   - Update `POST /sales` to handle customer linking

### Phase 2: Frontend
1. Update Sales Terminal (Cart Page):
   - Add customer search field
   - Phone number fallback field
   - Customer info display
   - Walk-in badge
2. Create Customer Management Pages:
   - `app/customers/page.tsx` - List all customers
   - `app/customers/[id]/page.tsx` - Customer detail page
   - Components: Profile card, Purchase history table, Notes section, Payment form
3. Integrate customer creation flow (on-the-fly during checkout)

### Phase 3: Database & Data
1. Run migration script on existing data
2. Test customer linking with various scenarios
