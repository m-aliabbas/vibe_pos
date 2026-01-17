# Product Variations & Unit of Measure - Implementation Plan

**Created**: January 15, 2026  
**Status**: Planning Phase  
**Priority**: High - Essential for flexible product management

---

## Overview

Enhance the product system to support:
1. **Product Variations** - Size, color, and custom attributes with different prices/SKUs
2. **Unit of Measure** - Sell products in different units (pieces, dozens, packets, kg, etc.)
3. **Flexible Pricing** - Different prices for different variations and units

---

## Requirements Analysis

### Product Variations
- Products can have multiple variation types (size, color, style, etc.)
- Each variation can have multiple options (S/M/L, Red/Blue/Green)
- Each variation combination can have:
  - Unique SKU
  - Different price
  - Separate stock quantity
  - Different barcode (optional)

### Unit of Measure
- Products can be sold in different units:
  - **Count-based**: Pieces, Dozens (12), Half-Dozen (6), Packets
  - **Weight-based**: Kg, Gram, Pound, Ounce
  - **Volume-based**: Liter, Milliliter, Gallon
  - **Custom**: Box, Carton, Bundle
- Each unit can have a conversion factor (e.g., 1 dozen = 12 pieces)
- Base unit for inventory tracking
- Display unit for sales

---

## Implementation Plan - 10 Steps

### **Step 1: Design Database Models**

**New Models:**

```python
# Product Model Extensions
class Product(Base):
    # ... existing fields ...
    has_variations = Column(Boolean, default=False)
    variation_attributes = Column(JSON, default=[])  # ["Size", "Color", "Style"] - User defined
    
    # Unit of Measure
    base_unit = Column(String, default="piece")  # piece, kg, liter, etc.
    selling_units = Column(JSON, default=[])  # [{"unit": "dozen", "factor": 12, "price": 100}]
    
    # Relationships
    variations = relationship("ProductVariation", back_populates="product")


# New: Product Variation Model
class ProductVariation(Base):
    __tablename__ = "product_variations"
    
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    
    # Variation attributes (JSON for flexibility)
    # Example: {"Size": "M", "Color": "Red", "Style": "V-Neck"}
    # Keys match product.variation_attributes
    attributes = Column(JSON)
    
    # Variation-specific fields
    sku = Column(String, unique=True, index=True)
    price_adjustment = Column(Float, default=0.0)  # +/- from base price
    quantity = Column(Integer, default=0)  # Stock for this variation
    barcode = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    product = relationship("Product", back_populates="variations")


# New: Unit of Measure Model (Optional - for predefined units)
class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"
    
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)  # dozen, kg, liter, packet
    category = Column(String)  # count, weight, volume, custom
    symbol = Column(String, nullable=True)  # doz, kg, L
    description = Column(String, nullable=True)
```

**Database Migration:**
```sql
-- Add to products table
ALTER TABLE products ADD COLUMN has_variations BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN variation_attributes JSON DEFAULT '[]';  -- User-defined attribute names
ALTER TABLE products ADD COLUMN base_unit VARCHAR DEFAULT 'piece';
ALTER TABLE products ADD COLUMN selling_units JSON DEFAULT '[]';

-- Create product_variations table
CREATE TABLE product_variations (
    id INTEGER PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    attributes JSON,  -- {"Size": "M", "Color": "Red"}
    sku VARCHAR UNIQUE,
    price_adjustment FLOAT DEFAULT 0.0,
    quantity INTEGER DEFAULT 0,
    barcode VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create units_of_measure table (optional)
CREATE TABLE units_of_measure (
    id INTEGER PRIMARY KEY,
    name VARCHAR UNIQUE NOT NULL,
    category VARCHAR,
    symbol VARCHAR,
    description VARCHAR
);
```

---

### **Step 2: Create Backend Schemas**

```python
# schemas/product.py

# Unit of Measure Schema
class SellingUnit(BaseModel):
    unit: str  # dozen, kg, packet
    factor: float  # conversion factor to base unit
    price: float  # price for this unit
    
class UnitOfMeasureBase(BaseModel):
    name: str
    category: str  # count, weight, volume, custom
    symbol: Optional[str] = None
    description: Optional[str] = None

# Product Variation Schemas
class ProductVariationBase(BaseModel):
    attributes: dict  # {"Size": "M", "Color": "Red", "Style": "V-Neck"}
    sku: str
    price_adjustment: float = 0.0
    quantity: int = 0
    barcode: Optional[str] = None

class ProductVariationCreate(ProductVariationBase):
    pass

class ProductVariation(ProductVariationBase):
    id: int
    product_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Extended Product Schemas
class ProductCreate(BaseModel):
    # ... existing fields ...
    has_variations: bool = False
    variation_attributes: List[str] = []  # ["Size", "Color"] - User-defined attribute types
    base_unit: str = "piece"
    selling_units: List[SellingUnit] = []
    variations: List[ProductVariationCreate] = []

class Product(BaseModel):
    # ... existing fields ...
    has_variations: bool
    variation_attributes: List[str]  # User-defined attribute types
    base_unit: str
    selling_units: List[SellingUnit]
    variations: List[ProductVariation] = []
```

---

### **Step 3: Update Backend Endpoints**

**Files to Update:**
- `backend/app/api/v1/endpoints/products.py`

**New/Updated Endpoints:**

```python
# POST /products - Create product with variations
@router.post("/", response_model=ProductSchema)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin)
):
    # Create base product
    db_product = Product(**product_in.dict(exclude={'variations'}))
    db.add(db_product)
    db.flush()
    
    # Create variations if has_variations
    if product_in.has_variations and product_in.variations:
        for var_in in product_in.variations:
            db_variation = ProductVariation(
                product_id=db_product.id,
                **var_in.dict()
            )
            db.add(db_variation)
    
    db.commit()
    db.refresh(db_product)
    return db_product

# GET /products/{id}/variations - Get all variations
@router.get("/{id}/variations", response_model=List[ProductVariationSchema])
def get_product_variations(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product.variations

# POST /products/{id}/variations - Add variation
@router.post("/{id}/variations", response_model=ProductVariationSchema)
def create_variation(
    id: int,
    variation_in: ProductVariationCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin)
):
    product = db.query(Product).filter(Product.id == id).first()
    if not product or not product.has_variations:
        raise HTTPException(status_code=400, detail="Product doesn't support variations")
    
    db_variation = ProductVariation(
        product_id=id,
        **variation_in.dict()
    )
    db.add(db_variation)
    db.commit()
    db.refresh(db_variation)
    return db_variation

# PUT /products/variations/{variation_id} - Update variation
# DELETE /products/variations/{variation_id} - Delete variation

# GET /units - Get predefined units of measure
@router.get("/units", response_model=List[UnitOfMeasureSchema])
def get_units_of_measure(db: Session = Depends(deps.get_db)):
    return db.query(UnitOfMeasure).all()
```

---

### **Step 4: Update Sales Logic**

**Changes to Sale Creation:**

```python
# When adding item to sale, need to track:
class SaleItemCreate(BaseModel):
    product_id: int
    variation_id: Optional[int] = None  # If product has variations
    quantity: int
    unit: str = "piece"  # Selling unit used

# In sale creation endpoint:
for item in sale_in.items:
    if item.variation_id:
        # Get variation price
        variation = db.query(ProductVariation).filter(
            ProductVariation.id == item.variation_id
        ).first()
        base_price = product.selling_price + variation.price_adjustment
        # Deduct from variation stock
        variation.quantity -= item.quantity
    else:
        base_price = product.selling_price
    
    # Apply unit conversion
    if item.unit != product.base_unit:
        # Find unit factor and adjust quantity/price
        unit_info = next((u for u in product.selling_units if u["unit"] == item.unit), None)
        if unit_info:
            base_price = unit_info["price"]
            actual_quantity = item.quantity * unit_info["factor"]
            product.quantity -= actual_quantity
```

---

### **Step 5: Frontend - Product Form UI**

**File:** `frontend/app/inventory/page.tsx`

**New UI Elements:**

1. **Variation Toggle:**
```tsx
<div className="space-y-2">
  <div className="flex items-center space-x-2">
    <Switch
      id="has_variations"
      checked={hasVariations}
      onCheckedChange={setHasVariations}
    />
    <Label htmlFor="has_variations">
      This product has variations (size, color, etc.)
    </Label>
  </div>
</div>
```

2. **Variation Management (if enabled):**
```tsx
{hasVariations && (
  <Card>
    <CardHeader>
      <CardTitle>Product Variations</CardTitle>
      <CardDescription>
        Define variation types (like Size, Color) and their values
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      
      {/* Step 1: Define Variation Attributes */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">
          Step 1: Define Variation Types
        </Label>
        <p className="text-sm text-muted-foreground">
          Add attribute types like "Size", "Color", "Material", etc.
        </p>
        
        {variationAttributes.map((attr, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input 
              placeholder="Attribute name (e.g., Size)"
              value={attr.name}
              onChange={(e) => updateAttributeName(idx, e.target.value)}
            />
            <Input 
              placeholder="Values separated by comma (e.g., S, M, L, XL)"
              value={attr.values.join(", ")}
              onChange={(e) => updateAttributeValues(idx, e.target.value)}
              className="flex-1"
            />
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => removeAttribute(idx)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        
        <Button 
          variant="outline" 
          onClick={addAttribute}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Variation Type
        </Button>
      </div>

      {/* Step 2: Generate or Manually Add Variations */}
      {variationAttributes.length > 0 && (
        <div className="space-y-4 pt-4 border-t">
          <div className="flex justify-between items-center">
            <div>
              <Label className="text-base font-semibold">
                Step 2: Create Variations
              </Label>
              <p className="text-sm text-muted-foreground">
                Generate all combinations or add manually
              </p>
            </div>
            <Button onClick={generateAllCombinations}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate All Combinations
            </Button>
          </div>
          
          {/* Variation Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variation</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Price Adjustment</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variations.map((variation, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <div className="space-y-1">
                      {Object.entries(variation.attributes).map(([key, value]) => (
                        <Badge key={key} variant="outline">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input 
                      value={variation.sku}
                      onChange={(e) => updateVariation(idx, 'sku', e.target.value)}
                      placeholder="AUTO"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number"
                      value={variation.price_adjustment}
                      onChange={(e) => updateVariation(idx, 'price_adjustment', parseFloat(e.target.value))}
                      placeholder="0.00"
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number"
                      value={variation.quantity}
                      onChange={(e) => updateVariation(idx, 'quantity', parseInt(e.target.value))}
                      placeholder="0"
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      value={variation.barcode || ''}
                      onChange={(e) => updateVariation(idx, 'barcode', e.target.value)}
                      placeholder="Optional"
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => removeVariation(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <Button 
            variant="outline" 
            onClick={addManualVariation}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Variation Manually
          </Button>
        </div>
      )}
    </CardContent>
  </Card>
)}
```

**Helper Functions:**
```tsx
const [variationAttributes, setVariationAttributes] = useState<
  Array<{ name: string; values: string[] }>
>([]);
const [variations, setVariations] = useState<Array<ProductVariation>>([]);

const addAttribute = () => {
  setVariationAttributes([...variationAttributes, { name: '', values: [] }]);
};

const updateAttributeName = (idx: number, name: string) => {
  const updated = [...variationAttributes];
  updated[idx].name = name;
  setVariationAttributes(updated);
};

const updateAttributeValues = (idx: number, valueString: string) => {
  const updated = [...variationAttributes];
  updated[idx].values = valueString.split(',').map(v => v.trim()).filter(v => v);
  setVariationAttributes(updated);
};

const removeAttribute = (idx: number) => {
  setVariationAttributes(variationAttributes.filter((_, i) => i !== idx));
};

// Generate all combinations of variation attributes
const generateAllCombinations = () => {
  if (variationAttributes.length === 0) return;
  
  // Cartesian product of all attribute values
  const combinations: Array<Record<string, string>> = [{}];
  
  variationAttributes.forEach(attr => {
    const newCombinations: Array<Record<string, string>> = [];
    combinations.forEach(combo => {
      attr.values.forEach(value => {
        newCombinations.push({ ...combo, [attr.name]: value });
      });
    });
    combinations.length = 0;
    combinations.push(...newCombinations);
  });
  
  // Create variations from combinations
  const newVariations = combinations.map(attrs => ({
    attributes: attrs,
    sku: generateSKU(attrs),
    price_adjustment: 0,
    quantity: 0,
    barcode: null
  }));
  
  setVariations(newVariations);
};

const generateSKU = (attributes: Record<string, string>) => {
  // Auto-generate SKU from product SKU + variation attributes
  const attrCode = Object.values(attributes)
    .map(v => v.substring(0, 2).toUpperCase())
    .join('-');
  return `${productSKU}-${attrCode}`;
};
```
          </TableHeader>
          <TableBody>
            {variations.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  {Object.entries(v.attributes).map(([k, v]) => 
                    `${k}: ${v}`
                  ).join(", ")}
                </TableCell>
                <TableCell>{v.sku}</TableCell>
                <TableCell>${v.price_adjustment}</TableCell>
                <TableCell>{v.quantity}</TableCell>
                <TableCell>
                  <Button size="sm">Edit</Button>
                  <Button size="sm" variant="destructive">Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
)}
```

3. **Unit of Measure Section:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Unit of Measure</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div>
      <Label>Base Unit (for inventory)</Label>
      <Select value={baseUnit} onValueChange={setBaseUnit}>
        <SelectItem value="piece">Piece</SelectItem>
        <SelectItem value="kg">Kilogram</SelectItem>
        <SelectItem value="liter">Liter</SelectItem>
        <SelectItem value="packet">Packet</SelectItem>
      </Select>
    </div>
    
    <div>
      <Label>Selling Units</Label>
      <Button onClick={addSellingUnit} variant="outline">
        + Add Selling Unit
      </Button>
      {sellingUnits.map((unit, idx) => (
        <div key={idx} className="flex gap-2 mt-2">
          <Input 
            placeholder="Unit (e.g., dozen)" 
            value={unit.unit}
            onChange={(e) => updateUnit(idx, 'unit', e.target.value)}
          />
          <Input 
            type="number"
            placeholder="Factor (e.g., 12)" 
            value={unit.factor}
            onChange={(e) => updateUnit(idx, 'factor', parseFloat(e.target.value))}
          />
          <Input 
            type="number"
            placeholder="Price" 
            value={unit.price}
            onChange={(e) => updateUnit(idx, 'price', parseFloat(e.target.value))}
          />
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => removeUnit(idx)}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

---

### **Step 6: Frontend - Sales Terminal Updates**

**File:** `frontend/app/sales/page.tsx`

**Updates:**

1. **Product Display with Variations:**
```tsx
<TableRow>
  <TableCell>
    <div>
      <p className="font-medium">{product.name}</p>
      {product.has_variations && (
        <p className="text-sm text-muted-foreground">
          {product.variations.length} variations available
        </p>
      )}
    </div>
  </TableCell>
  {/* ... */}
</TableRow>
```

2. **Variation Selector Dialog:**
```tsx
<Dialog open={variationDialogOpen} onOpenChange={setVariationDialogOpen}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Select Variation - {selectedProduct?.name}</DialogTitle>
      <DialogDescription>
        Choose the specific variation you want to add to cart
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {selectedProduct?.variations.map((variation) => (
        <Card 
          key={variation.id}
          className="p-4 cursor-pointer hover:bg-muted transition-colors"
          onClick={() => addVariationToCart(selectedProduct, variation)}
        >
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                {Object.entries(variation.attributes).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="text-sm">
                    <span className="font-semibold">{key}:</span> {value}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                SKU: {variation.sku}
              </p>
              {variation.barcode && (
                <p className="text-xs text-muted-foreground">
                  Barcode: {variation.barcode}
                </p>
              )}
            </div>
            <div className="text-right space-y-1">
              <p className="text-lg font-bold">
                ${(selectedProduct.selling_price + variation.price_adjustment).toFixed(2)}
              </p>
              {variation.price_adjustment !== 0 && (
                <p className="text-xs text-muted-foreground">
                  {variation.price_adjustment > 0 ? '+' : ''}
                  ${variation.price_adjustment.toFixed(2)}
                </p>
              )}
              <Badge 
                variant={variation.quantity > 0 ? "default" : "destructive"}
                className="ml-auto"
              >
                Stock: {variation.quantity}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setVariationDialogOpen(false)}>
        Cancel
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
                ${(product.selling_price + variation.price_adjustment).toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground">
                Stock: {variation.quantity}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </DialogContent>
</Dialog>
```

3. **Unit Selector in Cart:**
```tsx
<Select 
  value={item.unit} 
  onValueChange={(unit) => updateCartItemUnit(item.id, unit)}
>
  <SelectItem value={product.base_unit}>
    {product.base_unit}
  </SelectItem>
  {product.selling_units.map((unit) => (
    <SelectItem key={unit.unit} value={unit.unit}>
      {unit.unit} (${unit.price})
    </SelectItem>
  ))}
</Select>
```

---

### **Step 7: Update Invoice/Receipt Display**

**Show variation details and units on invoice:**

```tsx
{sale.items.map((item) => (
  <div key={item.id}>
    <div className="font-medium">{item.product.name}</div>
    {item.variation && (
      <div className="text-xs text-gray-500">
        {Object.entries(item.variation.attributes).map(([k, v]) => 
          `${k}: ${v}`
        ).join(", ")}
      </div>
    )}
    <div className="text-xs text-gray-600">
      {item.quantity} {item.unit} × ${item.unit_price.toFixed(2)}
    </div>
  </div>
))}
```

---

### **Step 8: Seed Data for Testing**

```python
# Add to seed.py

# Predefined units
units = [
    {"name": "piece", "category": "count", "symbol": "pc"},
    {"name": "dozen", "category": "count", "symbol": "doz"},
    {"name": "half_dozen", "category": "count", "symbol": "½doz"},
    {"name": "packet", "category": "count", "symbol": "pkt"},
    {"name": "kilogram", "category": "weight", "symbol": "kg"},
    {"name": "gram", "category": "weight", "symbol": "g"},
    {"name": "liter", "category": "volume", "symbol": "L"},
    {"name": "box", "category": "custom", "symbol": "box"},
]

# Example product with variations
product_with_variations = Product(
    name="T-Shirt",
    sku="TSHIRT-001",
    category="Clothing",
    selling_price=20.0,
    quantity=0,  # Stock tracked in variations
    has_variations=True,
    base_unit="piece",
    vendor_id=1
)

variations = [
    {"attributes": {"size": "S", "color": "Red"}, "sku": "TSHIRT-S-RED", "price_adjustment": 0, "quantity": 10},
    {"attributes": {"size": "M", "color": "Red"}, "sku": "TSHIRT-M-RED", "price_adjustment": 0, "quantity": 15},
    {"attributes": {"size": "L", "color": "Red"}, "sku": "TSHIRT-L-RED", "price_adjustment": 2, "quantity": 12},
    {"attributes": {"size": "S", "color": "Blue"}, "sku": "TSHIRT-S-BLUE", "price_adjustment": 0, "quantity": 8},
]

# Example product with selling units
eggs = Product(
    name="Eggs",
    sku="EGGS-001",
    category="Grocery",
    selling_price=0.5,  # per piece
    quantity=240,  # 240 pieces in stock
    has_variations=False,
    base_unit="piece",
    selling_units=[
        {"unit": "piece", "factor": 1, "price": 0.5},
        {"unit": "half_dozen", "factor": 6, "price": 2.8},
        {"unit": "dozen", "factor": 12, "price": 5.5},
    ],
    vendor_id=1
)
```

---

### **Step 9: Update Purchase Orders**

**Allow purchasing specific variations:**

```python
class PurchaseItemCreate(BaseModel):
    product_id: int
    variation_id: Optional[int] = None
    quantity: int
    unit_cost: float

# In purchase creation:
if item.variation_id:
    variation.quantity += item.quantity
else:
    product.quantity += item.quantity
```

---

### **Step 10: Testing & Validation**

**Test Cases:**

1. **Product with Size Variations:**
   - Create T-Shirt with S/M/L sizes
   - Different prices for different sizes
   - Track stock separately per size
   - Sell specific size from sales terminal

2. **Product with Selling Units:**
   - Create Eggs product
   - Sell as pieces, half-dozen, dozen
   - Verify correct inventory deduction
   - Verify correct pricing

3. **Combined Scenario:**
   - Product with variations AND selling units
   - Bottled Water: Size (500ml, 1L, 2L) + Unit (bottle, 6-pack, case)

4. **Edge Cases:**
   - Out of stock for specific variation
   - Invalid variation selection
   - Unit conversion accuracy
   - Purchase order updates stock correctly

---

## UI/UX Considerations

### Product Management
- Clear visual indicator for products with variations
- Easy bulk creation of variations (size × color = all combinations)
- Quick stock adjustment per variation
- Filter/search by variation attributes

### Sales Terminal
- Show "Select Variation" if product has variations
- Visual picker for common variations (size buttons, color swatches)
- Default unit selection
- Quick "dozen" or "packet" buttons for common units

### Reporting
- Sales by variation (which sizes sell most?)
- Stock alerts per variation
- Low stock by variation
- Best-selling units

---

## Database Schema Summary

```
products
├── has_variations (boolean)
├── base_unit (string)
└── selling_units (JSON array)

product_variations (NEW)
├── id
├── product_id (FK)
├── attributes (JSON) {"size": "M", "color": "Red"}
├── sku (unique)
├── price_adjustment (float)
├── quantity (int)
└── barcode (string)

units_of_measure (NEW - optional)
├── id
├── name (dozen, kg, etc.)
├── category (count, weight, volume)
└── symbol (doz, kg, L)
```

---

## Timeline Estimate

- **Step 1-2**: Database models & schemas - 2 hours
- **Step 3**: Backend endpoints - 3 hours
- **Step 4**: Sales logic updates - 2 hours
- **Step 5**: Product form UI - 4 hours
- **Step 6**: Sales terminal updates - 3 hours
- **Step 7**: Invoice updates - 1 hour
- **Step 8**: Seed data - 30 minutes
- **Step 9**: Purchase order updates - 1 hour
- **Step 10**: Testing - 2 hours

**Total Estimated Time**: ~18-20 hours

---

## Success Criteria

- ✅ Products can have multiple variations
- ✅ Each variation has independent SKU, price, and stock
- ✅ Products can be sold in different units (pieces, dozens, kg, etc.)
- ✅ Selling units have correct conversion factors
- ✅ Sales terminal shows variation selection
- ✅ Inventory correctly deducts from variations
- ✅ Invoices show variation details
- ✅ Purchase orders can restock variations
- ✅ Reporting includes variation data

---

## Future Enhancements

- Variation templates (create all size/color combos automatically)
- Image per variation
- Barcode scanning for variations
- Bulk price adjustments
- Variation bundles (buy 3 get discount)
- Dynamic pricing by unit (wholesale vs retail)
- Weight-based products with pricing per kg
- Auto-generate SKUs for variations
