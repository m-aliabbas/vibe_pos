'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, ArrowRight, Plus } from "lucide-react";

function PurchasePageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedVendorId = searchParams.get('vendorId');
    const productInputRef = useRef<HTMLInputElement>(null);
    const quantityInputRef = useRef<HTMLInputElement>(null);
    const costInputRef = useRef<HTMLInputElement>(null);

    const [vendors, setVendors] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
    const productsRequestIdRef = useRef(0);

    // Purchase State
    const [vendorId, setVendorId] = useState(preselectedVendorId || '');
    const [vendorSearch, setVendorSearch] = useState('');
    const [showVendorDropdown, setShowVendorDropdown] = useState(false);
    const [filteredVendors, setFilteredVendors] = useState<any[]>([]);
    
    const [items, setItems] = useState<any[]>([]);
    const [amountPaid, setAmountPaid] = useState<string>('');
    
    // Item input state
    const [productSearch, setProductSearch] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const [selectedProductIndex, setSelectedProductIndex] = useState(0);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [qty, setQty] = useState('');
    const [cost, setCost] = useState('');
    const [expiry, setExpiry] = useState('');
    const [retailPrice, setRetailPrice] = useState('');
    const [updateRetailPrice, setUpdateRetailPrice] = useState(false);
    
    // New Product Dialog
    const [showNewProductDialog, setShowNewProductDialog] = useState(false);
    const [newProductName, setNewProductName] = useState('');
    const [newProductSku, setNewProductSku] = useState('');
    const [newProductCategory, setNewProductCategory] = useState('');
    const [newProductSellingPrice, setNewProductSellingPrice] = useState('');
    const [newProductCostPrice, setNewProductCostPrice] = useState('');
    const [savingProduct, setSavingProduct] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (preselectedVendorId && vendors.length > 0) {
            const vendor = vendors.find(v => v.id.toString() === preselectedVendorId);
            if (vendor) {
                setVendorSearch(vendor.name);
            }
        }
    }, [preselectedVendorId, vendors]);

    useEffect(() => {
        if (vendorSearch.trim()) {
            const filtered = vendors.filter(v =>
                v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
                v.email?.toLowerCase().includes(vendorSearch.toLowerCase())
            );
            setFilteredVendors(filtered);
        } else {
            setFilteredVendors(vendors);
        }
    }, [vendorSearch, vendors]);

    useEffect(() => {
        if (!productSearch.trim()) {
            setFilteredProducts([]);
            setShowProductDropdown(false);
            return;
        }

        const timer = setTimeout(() => {
            fetchProducts(productSearch.trim());
        }, 300);

        return () => clearTimeout(timer);
    }, [productSearch]);

    const fetchData = async () => {
        try {
            const [vRes] = await Promise.all([
                api.get('/vendors/')
            ]);
            setVendors(vRes.data);
            setFilteredVendors(vRes.data);
        } catch (error) {
            console.error("Failed to load data", error);
        }
    };

    const fetchProducts = async (searchTerm: string) => {
        const requestId = ++productsRequestIdRef.current;
        try {
            const { data } = await api.get('/products/', {
                params: { search: searchTerm, limit: 500 }
            });
            if (requestId !== productsRequestIdRef.current) {
                return;
            }
            setProducts(data);
            setFilteredProducts(data);
            setShowProductDropdown(true);
            setSelectedProductIndex(0);
        } catch (error) {
            console.error("Failed to fetch products", error);
        }
    };

    const selectVendor = (vendor: any) => {
        setVendorId(vendor.id.toString());
        setVendorSearch(vendor.name);
        setShowVendorDropdown(false);
    };

    const selectProduct = (product: any) => {
        setSelectedProduct(product);
        setProductSearch(product.name);
        setCost(product.cost_price?.toString() || '');
        setRetailPrice(
            product.selling_price !== null && product.selling_price !== undefined
                ? product.selling_price.toString()
                : ''
        );
        setUpdateRetailPrice(false);
        setShowProductDropdown(false);
        // Focus on quantity input
        setTimeout(() => quantityInputRef.current?.focus(), 0);
    };
    
    const openNewProductDialog = () => {
        setNewProductName(productSearch);
        setNewProductSku('');
        setNewProductCategory('');
        setNewProductSellingPrice('');
        setNewProductCostPrice('');
        setShowNewProductDialog(true);
        setShowProductDropdown(false);
    };
    
    const createNewProduct = async () => {
        if (!newProductName || !newProductSku || !newProductSellingPrice) {
            alert('Please fill in required fields: Name, SKU, and Selling Price');
            return;
        }
        
        try {
            setSavingProduct(true);
            const response = await api.post('/products/', {
                name: newProductName,
                sku: newProductSku,
                category: newProductCategory || 'General',
                selling_price: parseFloat(newProductSellingPrice),
                cost_price: newProductCostPrice ? parseFloat(newProductCostPrice) : parseFloat(newProductSellingPrice),
                quantity: 0,
                vendor_id: parseInt(vendorId),
                has_variations: false,
                variation_attributes: [],
                base_unit: 'piece',
                selling_units: []
            });
            
            // Add to products list
            const newProduct = response.data;
            setProducts([...products, newProduct]);
            
            // Select the new product
            selectProduct(newProduct);
            
            // Close dialog
            setShowNewProductDialog(false);
            
            alert('Product created successfully!');
        } catch (error: any) {
            console.error('Failed to create product:', error);
            alert(error.response?.data?.detail || 'Failed to create product');
        } finally {
            setSavingProduct(false);
        }
    };

    const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showProductDropdown) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedProductIndex(prev =>
                prev < filteredProducts.length - 1 ? prev + 1 : prev
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedProductIndex(prev => prev > 0 ? prev - 1 : 0);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredProducts[selectedProductIndex]) {
                selectProduct(filteredProducts[selectedProductIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowProductDropdown(false);
        }
    };

    const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            costInputRef.current?.focus();
        }
    };

    const handleCostKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addItem();
        }
    };

    const addItem = () => {
        if (!selectedProduct || !qty || !cost) return;
        if (updateRetailPrice && (!retailPrice || parseFloat(retailPrice) < 0)) {
            alert('Please enter a valid retail price (>= 0)');
            return;
        }

        const newItem = {
            product_id: selectedProduct.id,
            product_name: selectedProduct.name,
            product_sku: selectedProduct.sku,
            quantity: parseInt(qty),
            unit_cost: parseFloat(cost),
            total_cost: parseInt(qty) * parseFloat(cost),
            expiry_date: expiry ? new Date(expiry).toISOString() : null,
            selling_price: updateRetailPrice ? parseFloat(retailPrice) : null,
            update_selling_price: updateRetailPrice
        };

        setItems([...items, newItem]);
        
        // Reset Item Form
        setSelectedProduct(null);
        setProductSearch('');
        setQty('');
        setCost('');
        setExpiry('');
        setRetailPrice('');
        setUpdateRetailPrice(false);
        
        // Focus back on product input
        setTimeout(() => productInputRef.current?.focus(), 0);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const totalAmount = items.reduce((acc, item) => acc + item.total_cost, 0);

    const handleSubmit = async () => {
        if (!vendorId || items.length === 0) {
            alert("Please select a vendor and add at least one item");
            return;
        }

        try {
            await api.post('/purchases/', {
                vendor_id: parseInt(vendorId),
                amount_paid: amountPaid ? parseFloat(amountPaid) : 0,
                items: items.map(i => ({
                    product_id: i.product_id,
                    quantity: i.quantity,
                    unit_cost: i.unit_cost,
                    expiry_date: i.expiry_date,
                    selling_price: i.update_selling_price ? i.selling_price : undefined,
                    update_selling_price: i.update_selling_price
                }))
            });
            router.push(`/vendors/${vendorId}`);
        } catch (error) {
            console.error("Failed to submit purchase", error);
            alert("Failed to submit purchase");
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-[1400px]">
            <h1 className="text-3xl font-bold mb-8">New Purchase Order</h1>

            <div className="space-y-6">
                {/* 1. Select Vendor */}
                <div className="border rounded-lg p-6 bg-white">
                    <h2 className="text-xl font-semibold mb-4">1. Select Vendor</h2>
                    <div className="relative max-w-md">
                        <Label className="mb-2 block">Vendor</Label>
                        <Input
                            placeholder="Search vendor by name..."
                            value={vendorSearch}
                            onChange={(e) => {
                                setVendorSearch(e.target.value);
                                setShowVendorDropdown(true);
                            }}
                            onFocus={() => setShowVendorDropdown(true)}
                            className="text-base"
                        />
                        {showVendorDropdown && filteredVendors.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {filteredVendors.map((vendor) => (
                                    <div
                                        key={vendor.id}
                                        className="p-3 cursor-pointer hover:bg-slate-100 border-b last:border-b-0"
                                        onClick={() => selectVendor(vendor)}
                                    >
                                        <div className="font-medium">{vendor.name}</div>
                                        {vendor.email && (
                                            <div className="text-sm text-muted-foreground">{vendor.email}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. Add Items */}
                <div className={`border rounded-lg p-6 bg-white ${!vendorId ? 'opacity-50' : ''}`}>
                    <h2 className="text-xl font-semibold mb-4">2. Add Items</h2>
                    <p className="text-muted-foreground mb-6">Type product name or SKU, then Tab through quantity and price</p>

                    {/* Add Item Row */}
                    <div className="grid grid-cols-12 gap-4 items-end mb-6">
                        <div className="col-span-4 relative">
                            <Label className="mb-2 block">Product</Label>
                            <Input
                                ref={productInputRef}
                                placeholder="Type name or SKU..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                onKeyDown={handleProductKeyDown}
                                onFocus={() => productSearch && setShowProductDropdown(true)}
                                disabled={!vendorId}
                                className="text-base"
                            />
                            {showProductDropdown && (
                                <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    {filteredProducts.length > 0 ? (
                                        <>
                                            {filteredProducts.map((product, index) => (
                                                <div
                                                    key={product.id}
                                                    className={`p-3 cursor-pointer border-b ${
                                                        index === selectedProductIndex
                                                            ? 'bg-primary/10 border-l-4 border-l-primary'
                                                            : 'hover:bg-slate-50'
                                                    }`}
                                                    onClick={() => selectProduct(product)}
                                                    onMouseEnter={() => setSelectedProductIndex(index)}
                                                >
                                                    <div className="font-medium">{product.name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        SKU: {product.sku} • Stock: {product.quantity > 0 ? product.quantity : '0 - Out of Stock'}
                                                    </div>
                                                </div>
                                            ))}
                                            <div
                                                className="p-3 cursor-pointer bg-green-50 hover:bg-green-100 border-t-2 flex items-center gap-2 text-green-700 font-medium"
                                                onClick={openNewProductDialog}
                                            >
                                                <Plus className="h-4 w-4" />
                                                Add "{productSearch}" as new product
                                            </div>
                                        </>
                                    ) : (
                                        <div
                                            className="p-4 cursor-pointer bg-green-50 hover:bg-green-100 flex items-center gap-2 text-green-700 font-medium justify-center"
                                            onClick={openNewProductDialog}
                                        >
                                            <Plus className="h-5 w-5" />
                                            No products found. Click to add "{productSearch}" as new product
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="col-span-2">
                            <Label className="mb-2 block">Quantity</Label>
                            <Input
                                ref={quantityInputRef}
                                type="number"
                                placeholder="0"
                                value={qty}
                                onChange={(e) => setQty(e.target.value)}
                                onKeyDown={handleQuantityKeyDown}
                                disabled={!selectedProduct}
                                className="text-base"
                            />
                        </div>
                        <div className="col-span-2">
                            <Label className="mb-2 block">Unit Cost ($)</Label>
                            <Input
                                ref={costInputRef}
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={cost}
                                onChange={(e) => setCost(e.target.value)}
                                onKeyDown={handleCostKeyDown}
                                disabled={!selectedProduct}
                                className="text-base"
                            />
                        </div>
                        <div className="col-span-3">
                            <Label className="mb-2 block">Expiry (Optional)</Label>
                            <Input
                                type="date"
                                value={expiry}
                                onChange={(e) => setExpiry(e.target.value)}
                                disabled={!selectedProduct}
                                className="text-base"
                            />
                        </div>
                        <div className="col-span-1">
                            <Button
                                onClick={addItem}
                                disabled={!selectedProduct || !qty || !cost}
                                className="w-full h-10"
                                size="lg"
                            >
                                Add
                            </Button>
                        </div>
                    </div>

                    {selectedProduct && (
                        <div className="mb-6 flex flex-wrap items-center gap-4 text-sm">
                            <div className="text-muted-foreground">
                                Current Retail: <span className="font-semibold">rs {selectedProduct.selling_price?.toFixed(2) ?? "0.00"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="updateRetailPrice"
                                    checked={updateRetailPrice}
                                    onCheckedChange={(checked) => setUpdateRetailPrice(!!checked)}
                                />
                                <Label htmlFor="updateRetailPrice">Update retail price</Label>
                            </div>
                            {updateRetailPrice && (
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="retailPrice">New Retail (rs)</Label>
                                    <Input
                                        id="retailPrice"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={retailPrice}
                                        onChange={(e) => setRetailPrice(e.target.value)}
                                        className="w-40"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Items Table */}
                    {items.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                            <div className="grid grid-cols-12 gap-4 bg-slate-100 p-4 font-semibold text-sm border-b">
                                <div className="col-span-3">Product</div>
                                <div className="col-span-2 text-right">Quantity</div>
                                <div className="col-span-2 text-right">Unit Cost</div>
                                <div className="col-span-2 text-right">Total</div>
                                <div className="col-span-2 text-right">Expiry</div>
                                <div className="col-span-1 text-center">Action</div>
                            </div>
                            {items.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="grid grid-cols-12 gap-4 p-4 items-center border-b last:border-b-0 hover:bg-slate-50"
                                >
                                    <div className="col-span-3">
                                        <div className="font-medium">{item.product_name}</div>
                                        <div className="text-sm text-muted-foreground">SKU: {item.product_sku}</div>
                                        {item.update_selling_price && (
                                            <div className="text-xs text-green-700">
                                                Retail update: rs {item.selling_price?.toFixed(2)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-span-2 text-right font-medium">{item.quantity}</div>
                                    <div className="col-span-2 text-right">${item.unit_cost.toFixed(2)}</div>
                                    <div className="col-span-2 text-right font-bold">rs {item.total_cost.toFixed(2)}</div>
                                    <div className="col-span-2 text-right text-sm text-muted-foreground">
                                        {item.expiry_date
                                            ? new Date(item.expiry_date).toLocaleDateString()
                                            : '-'}
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeItem(idx)}
                                        >
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Payment & Confirmation */}
                <div className={`border rounded-lg p-6 bg-white ${items.length === 0 ? 'opacity-50' : ''}`}>
                    <h2 className="text-xl font-semibold mb-4">3. Payment & Confirmation</h2>

                    <div className="max-w-md space-y-4">
                        <div className="flex justify-between items-center text-2xl font-bold py-4 border-y">
                            <span>Total Payable:</span>
                            <span>rs {totalAmount.toFixed(2)}</span>
                        </div>

                        <div>
                            <Label className="mb-2 block">Amount Paid Now ($)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={amountPaid}
                                onChange={(e) => setAmountPaid(e.target.value)}
                                placeholder="0.00"
                                disabled={items.length === 0}
                                className="text-base"
                            />
                            <p className="text-sm text-muted-foreground mt-2">
                                Leave empty or 0 for credit purchase.
                            </p>
                        </div>

                        <Button
                            className="w-full"
                            size="lg"
                            onClick={handleSubmit}
                            disabled={!vendorId || items.length === 0}
                        >
                            Confirm Purchase Order
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* New Product Dialog */}
            <Dialog open={showNewProductDialog} onOpenChange={setShowNewProductDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add New Product</DialogTitle>
                        <DialogDescription>
                            Create a new product to add to this purchase order
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="productName">
                                    Product Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="productName"
                                    value={newProductName}
                                    onChange={(e) => setNewProductName(e.target.value)}
                                    placeholder="e.g., Premium Coffee Beans"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="productSku">
                                    SKU <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="productSku"
                                    value={newProductSku}
                                    onChange={(e) => setNewProductSku(e.target.value)}
                                    placeholder="e.g., COFFEE-001"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="productCategory">Category</Label>
                            <Input
                                id="productCategory"
                                value={newProductCategory}
                                onChange={(e) => setNewProductCategory(e.target.value)}
                                placeholder="e.g., Beverages, Grocery, Electronics"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="sellingPrice">
                                    Selling Price (rs) <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="sellingPrice"
                                    type="number"
                                    step="0.01"
                                    value={newProductSellingPrice}
                                    onChange={(e) => setNewProductSellingPrice(e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="costPrice">Cost Price (rs)</Label>
                                <Input
                                    id="costPrice"
                                    type="number"
                                    step="0.01"
                                    value={newProductCostPrice}
                                    onChange={(e) => setNewProductCostPrice(e.target.value)}
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Leave empty to use selling price
                                </p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowNewProductDialog(false)}
                            disabled={savingProduct}
                        >
                            Cancel
                        </Button>
                        <Button onClick={createNewProduct} disabled={savingProduct}>
                            {savingProduct ? 'Creating...' : 'Create Product'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function PurchasePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PurchasePageContent />
        </Suspense>
    );
}
