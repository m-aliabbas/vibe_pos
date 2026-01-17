# Feature 4: Billing and Invoicing - Implementation Plan

**Created**: January 15, 2026  
**Status**: Planning Phase  
**Priority**: High - Essential for complete POS system

---

## Overview

Build a comprehensive invoicing system that generates professional invoices from completed sales, allows viewing/printing, and maintains invoice history. This feature bridges the sales terminal with customer-facing documentation and record-keeping.

---

## Current State Analysis

### ✅ Already Implemented
- Sale model with customer_name, payment_method, totals
- Sale items with product details and pricing
- Payment tracking (amount_paid, amount_due, change_amount)
- Sales history page with transaction details
- Role-based access control

### 🔨 Needs Implementation
- Invoice-specific data structure (invoice number, dates, business info)
- Invoice view/print page
- PDF generation capability
- Invoice numbering system
- Print-friendly styling

---

## Implementation Plan - 8 Steps

### **Step 1: Extend Sale Model for Invoice Data** ✅ (Mostly Done)

**Status**: Sale model already has most required fields

**Files to Check/Update**:
- `backend/app/models/sale.py` - Verify all invoice fields exist
- `backend/app/schemas/sale.py` - Ensure all fields in response

**Required Fields** (Check if present):
- ✅ id (as invoice number)
- ✅ customer_name
- ✅ payment_method
- ✅ subtotal, discount, tax, total
- ✅ amount_paid, amount_due, change_amount
- ✅ created_at (invoice date)
- ✅ user_id (cashier/salesperson)
- ✅ items (with product details)

**Additional Nice-to-Have**:
- 📝 invoice_notes (optional notes on invoice)
- 📝 due_date (for credit sales)

**Outcome**: Confirmed sale model has all essential invoice data

---

### **Step 2: Create Invoice View Page (Frontend)**

**Goal**: Display sale as a professional, print-ready invoice

**Files to Create**:
- `frontend/app/sales/invoice/[id]/page.tsx` - Invoice view page

**Implementation**:
```typescript
// Key Features:
- Fetch sale data by ID via GET /sales/{id}
- Display in invoice format with:
  * Business header (store name, address, logo)
  * Invoice number (Sale ID formatted as INV-00001)
  * Invoice date
  * Customer information
  * Itemized product list (name, qty, price, total)
  * Subtotal, discount, tax breakdown
  * Total amount
  * Payment information (method, paid, due/change)
  * Footer with terms/thank you message
  
- Print-friendly CSS (@media print)
- Print button
- Back to sales history button
```

**Design Requirements**:
- Professional invoice layout
- Company branding area (logo placeholder)
- Clear typography for readability
- Print optimization (remove nav, buttons when printing)
- Responsive but optimized for A4/Letter size

**Testing**:
- View invoice for completed sale
- Print preview shows clean invoice
- All sale details display correctly

---

### **Step 3: Add Invoice Navigation from Sales History**

**Goal**: Easy access to invoice from sales history

**Files to Update**:
- `frontend/app/sales/history/page.tsx` - Add "View Invoice" button

**Implementation**:
```typescript
// In sales history table:
- Add "View Invoice" button/icon in Actions column
- On click: Navigate to /sales/invoice/{id}

// In sale details dialog:
- Add "View Invoice" button at bottom
- On click: Navigate to /sales/invoice/{id}
```

**Testing**:
- Click "View Invoice" from sales history
- Click "View Invoice" from sale details modal
- Both navigate to correct invoice page

---

### **Step 4: Add Invoice Link from Sales Terminal Success**

**Goal**: Quick invoice access after completing sale

**Files to Update**:
- `frontend/app/sales/page.tsx` - Update success dialog

**Implementation**:
```typescript
// In success dialog:
- Add "View Invoice" button alongside "New Sale"
- Navigate to /sales/invoice/{saleId}
- Optional: Auto-open invoice in new tab
```

**Testing**:
- Complete a sale
- Click "View Invoice" in success dialog
- Invoice page opens with correct sale data

---

### **Step 5: Implement Browser Print Functionality**

**Goal**: Allow printing invoices using browser print dialog

**Files to Update**:
- `frontend/app/sales/invoice/[id]/page.tsx` - Add print handler

**Implementation**:
```typescript
// Print functionality:
- Add print button that calls window.print()
- Add @media print CSS:
  * Hide navigation, buttons, breadcrumbs
  * Optimize margins for paper
  * Ensure page breaks correctly
  * Black & white friendly
  
// Print CSS (@media print):
.no-print { display: none; }
body { margin: 0; }
.invoice-container { padding: 20mm; }
```

**Design for Print**:
- A4/Letter page size
- Proper margins
- Header on each page (if multi-page)
- Footer with page numbers
- No color backgrounds (optional)

**Testing**:
- Click print button
- Preview shows clean invoice
- Print/save as PDF works correctly

---

### **Step 6: Add Company/Store Information Settings** (Optional MVP)

**Goal**: Customizable business information on invoices

**Option A - Hardcoded (Quick MVP)**:
```typescript
// Simple config file:
frontend/lib/store-config.ts
{
  storeName: "My Store",
  address: "123 Main St, City, State",
  phone: "(555) 123-4567",
  email: "store@example.com",
  taxId: "TAX-12345"
}
```

**Option B - Database (Future Enhancement)**:
- Create Settings model in backend
- Add settings management page for admins
- Fetch settings via API

**For MVP**: Use Option A (config file)

**Testing**:
- Invoice displays correct store information
- Easy to update store details

---

### **Step 7: Add Invoice Number Formatting**

**Goal**: Professional invoice numbering system

**Files to Update**:
- `frontend/app/sales/invoice/[id]/page.tsx` - Format display

**Implementation**:
```typescript
// Format sale ID as invoice number:
const formatInvoiceNumber = (saleId: number): string => {
  return `INV-${String(saleId).padStart(6, '0')}`;
  // Example: Sale ID 5 → INV-000005
};

// Display in invoice header:
<div className="invoice-number">
  Invoice #: {formatInvoiceNumber(sale.id)}
</div>
```

**Testing**:
- Invoice numbers display as INV-000001, INV-000002, etc.
- Numbers are properly zero-padded

---

### **Step 8: Add PDF Download Capability** (Optional Enhancement)

**Goal**: Allow downloading invoice as PDF

**Implementation Options**:

**Option A - Browser PDF Save** (Simplest):
```typescript
// Use window.print() with "Save as PDF" option
// Already works from Step 5
```

**Option B - Client-Side PDF Generation** (Better UX):
```typescript
// Using library like jsPDF or react-pdf
- npm install jspdf jspdf-autotable
- Generate PDF from invoice data
- Download directly without print dialog
```

**Option C - Server-Side PDF Generation** (Most Professional):
```typescript
// Backend:
- Install reportlab or weasyprint
- Create POST /sales/{id}/invoice/pdf endpoint
- Generate PDF server-side
- Return as downloadable file

// Frontend:
- Add "Download PDF" button
- Fetch PDF blob from API
- Trigger download
```

**For MVP**: Use Option A (print to PDF)  
**For Enhancement**: Implement Option B or C

---

## File Structure Summary

### New Files
```
frontend/
  app/
    sales/
      invoice/
        [id]/
          page.tsx          # Invoice view page
  lib/
    store-config.ts         # Store information config (optional)
```

### Files to Modify
```
frontend/
  app/
    sales/
      page.tsx              # Add invoice link to success dialog
      history/
        page.tsx            # Add "View Invoice" button
  app/
    globals.css             # Add print-specific CSS styles
```

### Backend (No Changes Required for MVP)
```
backend/
  app/
    models/sale.py          # Already has all required fields ✅
    schemas/sale.py         # Already exposes all data ✅
    api/v1/endpoints/
      sales.py              # GET /sales/{id} already works ✅
```

---

## Testing Checklist

### Functional Tests
- [ ] Invoice page displays sale data correctly
- [ ] All sale items show with correct quantities and prices
- [ ] Totals calculate correctly (subtotal, discount, tax, total)
- [ ] Payment information displays (paid, due, change)
- [ ] Customer name displays (or "Walk-in Customer")
- [ ] Invoice date formats correctly
- [ ] Invoice number displays professionally
- [ ] Store information appears correctly

### Navigation Tests
- [ ] Can navigate to invoice from sales history
- [ ] Can navigate to invoice from sale details modal
- [ ] Can navigate to invoice from sales terminal success
- [ ] Back button returns to previous page
- [ ] Direct URL access works (/sales/invoice/123)

### Print Tests
- [ ] Print button triggers browser print dialog
- [ ] Print preview shows clean invoice
- [ ] Navigation and buttons hidden in print view
- [ ] Page margins appropriate for printing
- [ ] Content fits on standard paper size
- [ ] Can save as PDF from print dialog

### Responsive Tests
- [ ] Invoice displays correctly on desktop
- [ ] Invoice displays correctly on tablet
- [ ] Invoice displays correctly on mobile
- [ ] Print optimized regardless of screen size

### Edge Cases
- [ ] Sale with no customer name shows "Walk-in Customer"
- [ ] Sale with discount displays correctly
- [ ] Sale with tax displays correctly
- [ ] Sale with udhar (amount due) shows balance
- [ ] Sale with overpayment shows change returned
- [ ] Multiple items display correctly
- [ ] Long product names don't break layout

### Security Tests
- [ ] Cashiers can only view own invoices
- [ ] Admins can view all invoices
- [ ] Invalid sale ID shows error message
- [ ] Deleted sale IDs handled gracefully

---

## Success Criteria

### MVP (Minimum Viable Product)
- ✅ Professional invoice view page created
- ✅ Invoice accessible from sales history
- ✅ Print functionality works
- ✅ All sale details display correctly
- ✅ Print-friendly CSS applied
- ✅ Invoice number formatting implemented

### Enhanced Version (Future)
- PDF download button
- Server-side PDF generation
- Email invoice capability
- Invoice customization (logo, colors)
- Settings page for store information
- Invoice templates selection
- Multi-language support
- Custom invoice notes field

---

## Timeline Estimate

- **Step 1**: 5 minutes (verify existing fields)
- **Step 2**: 45 minutes (create invoice page)
- **Step 3**: 15 minutes (add navigation buttons)
- **Step 4**: 10 minutes (update success dialog)
- **Step 5**: 30 minutes (print CSS and functionality)
- **Step 6**: 10 minutes (store config file)
- **Step 7**: 10 minutes (invoice number formatting)
- **Step 8**: Optional (future enhancement)

**Total MVP Time**: ~2 hours

---

## Dependencies

### Required Packages (Already Installed)
- React
- Next.js
- Tailwind CSS
- shadcn/ui components
- Lucide icons

### No New Dependencies Needed for MVP!

---

## Post-Implementation Tasks

1. Update task.md with completed status
2. Test all invoice functionality
3. Get user feedback on invoice design
4. Consider adding:
   - Invoice email functionality
   - PDF download (Option B or C)
   - Invoice customization settings
   - Invoice templates
   - Invoice history filtering

---

## Notes

- Invoice uses existing sale data - no backend changes needed for MVP
- Print-to-PDF works via browser - no PDF library needed initially
- Store information can be hardcoded for MVP, made configurable later
- Invoice number is simply formatted sale ID (no separate numbering system needed)
- Focus on clean, professional design that prints well
- Responsive design but optimized for A4/Letter printing

---

## Ready to Implement!

This feature builds directly on the completed Sales Terminal (Feature 3) and requires minimal backend work. The main effort is creating a professional, print-friendly frontend invoice template.
