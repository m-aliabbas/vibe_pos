# Sales Terminal Implementation Plan

## Overview
Implement a complete POS sales terminal for processing customer transactions with inventory integration.

## Sub-Features Breakdown

### 1. Backend: Sales Data Model ✅ (Step 1)
**Goal**: Create database models and schemas for sales transactions

**Tasks**:
- [ ] Create Sale model (id, user_id, customer_name, payment_method, subtotal, total, created_at)
- [ ] Create SaleItem model (id, sale_id, product_id, quantity, unit_price, total_price)
- [ ] Create Pydantic schemas for Sale and SaleItem
- [ ] Add relationships between models

**Files to Create/Modify**:
- `backend/app/models/sale.py`
- `backend/app/schemas/sale.py`
- `backend/app/db/base.py` (import new models)

---

### 2. Backend: Create Sale API ✅ (Step 2)
**Goal**: Endpoint to process sales transactions with inventory deduction

**Tasks**:
- [ ] Create POST /sales endpoint
- [ ] Validate product availability and stock levels
- [ ] Deduct inventory atomically (transaction)
- [ ] Calculate totals automatically
- [ ] Handle errors (insufficient stock, invalid products)
- [ ] Return complete sale details with items

**Files to Create/Modify**:
- `backend/app/api/v1/endpoints/sales.py`
- `backend/app/api/v1/api.py` (register sales router)

**Business Logic**:
- Check each product exists and has sufficient stock
- Use database transaction for atomic inventory updates
- Rollback on any error
- Record user who made the sale

---

### 3. Backend: Sales History & Stats ✅ (Step 3)
**Goal**: Retrieve sales history and statistics

**Tasks**:
- [ ] GET /sales - List all sales with filters (date, user)
- [ ] GET /sales/{id} - Get single sale details
- [ ] GET /sales/stats/today - Quick stats for today
- [ ] Add pagination support

**Files to Modify**:
- `backend/app/api/v1/endpoints/sales.py`

---

### 4. Frontend: Sales Terminal Layout ✅ (Step 4)
**Goal**: Create the main sales terminal UI structure

**Tasks**:
- [ ] Create sales terminal page component
- [ ] Left side: Product search/selection area
- [ ] Right side: Cart display with items
- [ ] Bottom: Total display and checkout button
- [ ] Responsive layout for touch screens

**Files to Create**:
- `frontend/app/sales/page.tsx`

**UI Components Needed**:
- Search bar with autocomplete
- Product grid/list for quick selection
- Cart item rows with quantity controls
- Total summary section
- Checkout button (prominent, green)

---

### 5. Frontend: Cart Management ✅ (Step 5)
**Goal**: Add/remove/update items in cart

**Tasks**:
- [ ] State management for cart (Zustand or local state)
- [ ] Add product to cart
- [ ] Update quantity (increment/decrement)
- [ ] Remove item from cart
- [ ] Calculate subtotal/total in real-time
- [ ] Show low stock warnings

**Files to Modify**:
- `frontend/app/sales/page.tsx`
- Optionally: `frontend/store/cartStore.ts` (if using Zustand)

**Features**:
- Quantity stepper buttons (+/-)
- Remove button (trash icon)
- Real-time total calculation
- Empty cart state
- Stock validation before adding

---

### 6. Frontend: Checkout Process ✅ (Step 6)
**Goal**: Complete sale transaction

**Tasks**:
- [ ] Checkout button triggers modal
- [ ] Optional: Customer name input
- [ ] Optional: Payment method selection
- [ ] Confirm sale button
- [ ] Submit to POST /sales endpoint
- [ ] Success notification
- [ ] Clear cart after success
- [ ] Error handling (out of stock, etc.)

**Files to Modify**:
- `frontend/app/sales/page.tsx`

**Checkout Flow**:
1. Click checkout → Open confirmation dialog
2. Show cart summary
3. Optional fields (customer, payment method)
4. Confirm → Submit to API
5. Success → Show toast, redirect or clear cart
6. Error → Show error message

---

### 7. Frontend: Product Search & Quick Add ✅ (Step 7)
**Goal**: Fast product selection for cashiers

**Tasks**:
- [ ] Real-time product search
- [ ] Barcode/SKU input simulation
- [ ] Quick-add buttons for popular items
- [ ] Product cards with images
- [ ] Keyboard shortcuts (Enter to add, etc.)

**Features**:
- Debounced search
- SKU/barcode quick entry
- Touch-friendly product tiles
- Visual feedback on add

---

### 8. Frontend: Enhanced UX Features ✅ (Step 8)
**Goal**: Polish and user experience improvements

**Tasks**:
- [ ] Recent sales sidebar/history
- [ ] Keyboard navigation support
- [ ] Touch-friendly buttons (large targets)
- [ ] Animations (cart add, checkout success)
- [ ] Loading states
- [ ] Empty states with helpful messages

---

## Implementation Order

### Phase 1: Core Backend (Steps 1-3)
1. ✅ Create models and schemas
2. ✅ Implement create sale endpoint
3. ✅ Add sales history endpoints

### Phase 2: Core Frontend (Steps 4-6)
4. ✅ Build sales terminal layout
5. ✅ Implement cart management
6. ✅ Add checkout process

### Phase 3: Enhancement (Steps 7-8)
7. ✅ Enhance product search
8. ✅ Add UX polish

---

## Testing Checklist

- [ ] Can add products to cart
- [ ] Can update quantities
- [ ] Can remove items
- [ ] Total calculates correctly
- [ ] Checkout reduces inventory
- [ ] Out-of-stock items blocked
- [ ] Transaction rollback on error
- [ ] Sales history shows correctly
- [ ] Search works efficiently
- [ ] Keyboard navigation works

---

## Next Steps After Completion

- Invoice generation (Feature 4)
- Sales reports and analytics (Feature 5)
- Receipt printing (future)
- Customer management (future)
