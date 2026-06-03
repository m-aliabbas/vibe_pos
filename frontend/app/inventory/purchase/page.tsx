'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api, { holdPurchasesApi, HoldPurchaseResponse } from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { storeConfig, fetchStoreConfig } from "@/lib/store-config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ArrowRight, Plus } from "lucide-react";

function PurchasePageContent() {
    const router = useRouter();
    const { token } = useAuthStore();
    const searchParams = useSearchParams();
    const preselectedVendorId = searchParams.get('vendorId');
    const openHeldFromQuery = searchParams.get('held') === '1';
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
    const [heldPurchases, setHeldPurchases] = useState<HoldPurchaseResponse[]>([]);
    const [heldOpen, setHeldOpen] = useState(false);
    const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
    const [priceChangedItems, setPriceChangedItems] = useState<any[]>([]);
    const [priceChangeDialogOpen, setPriceChangeDialogOpen] = useState(false);
    const [priceUpdateSelections, setPriceUpdateSelections] = useState<Record<number, string>>({});
    const [receiptData, setReceiptData] = useState<{
        title: string;
        vendorId?: string;
        vendorName: string;
        total: number;
        paid: number;
        date: string;
        status: string;
    } | null>(null);
    
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
    const [storeInfo, setStoreInfo] = useState(storeConfig);
    const [newProductName, setNewProductName] = useState('');
    const [newProductSku, setNewProductSku] = useState('');
    const [newProductCategory, setNewProductCategory] = useState('');
    const [newProductSellingPrice, setNewProductSellingPrice] = useState('');
    const [newProductCostPrice, setNewProductCostPrice] = useState('');
    const [savingProduct, setSavingProduct] = useState(false);
    const latestPurchaseSnapshotRef = useRef<{
        vendorId: string;
        vendorSearch: string;
        amountPaid: string;
        items: any[];
        token: string | null;
    }>({
        vendorId: '',
        vendorSearch: '',
        amountPaid: '',
        items: [],
        token: null,
    });
    const autoHoldInFlightRef = useRef(false);
    const lastAutoHoldSignatureRef = useRef<string>('');

    useEffect(() => {
        fetchData();
        fetchStoreConfig().then(setStoreInfo);
        fetchHeldPurchases();
    }, []);

    useEffect(() => {
        if (openHeldFromQuery) {
            setHeldOpen(true);
        }
    }, [openHeldFromQuery]);

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

    // Keep latest purchase draft snapshot for auto-hold
    useEffect(() => {
        latestPurchaseSnapshotRef.current = {
            vendorId,
            vendorSearch,
            amountPaid,
            items,
            token,
        };
    }, [vendorId, vendorSearch, amountPaid, items, token]);

    // Auto-hold draft on tab close/navigation/visibility changes
    useEffect(() => {
        const buildHoldRequest = (snapshot: {
            vendorId: string;
            vendorSearch: string;
            amountPaid: string;
            items: any[];
            token: string | null;
        }) => {
            const label = snapshot.vendorSearch.trim() || (snapshot.vendorId ? `Vendor #${snapshot.vendorId}` : 'Draft Purchase');
            const payload = {
                vendorId: snapshot.vendorId,
                vendorSearch: snapshot.vendorSearch,
                amountPaid: snapshot.amountPaid,
                items: snapshot.items,
            };
            const signature = JSON.stringify(payload);
            return { label, payload, signature };
        };

        const autoHoldCurrentPurchase = async () => {
            const snapshot = latestPurchaseSnapshotRef.current;
            const hasDraft =
                (snapshot.items || []).length > 0 ||
                !!snapshot.vendorId.trim() ||
                !!snapshot.vendorSearch.trim() ||
                !!snapshot.amountPaid.trim();
            if (!hasDraft || autoHoldInFlightRef.current) return;

            const { label, payload, signature } = buildHoldRequest(snapshot);
            if (signature === lastAutoHoldSignatureRef.current) return;

            autoHoldInFlightRef.current = true;
            try {
                await holdPurchasesApi.create({ label, payload });
                lastAutoHoldSignatureRef.current = signature;
            } catch (error) {
                console.error('Auto-hold purchase failed:', error);
            } finally {
                autoHoldInFlightRef.current = false;
            }
        };

        const autoHoldWithKeepAlive = () => {
            const snapshot = latestPurchaseSnapshotRef.current;
            const hasDraft =
                (snapshot.items || []).length > 0 ||
                !!snapshot.vendorId.trim() ||
                !!snapshot.vendorSearch.trim() ||
                !!snapshot.amountPaid.trim();
            if (!snapshot.token || !hasDraft) return;

            const { label, payload, signature } = buildHoldRequest(snapshot);
            if (signature === lastAutoHoldSignatureRef.current) return;

            const endpoint = 'http://127.0.0.1:8000/api/v1/hold-purchases/';
            fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${snapshot.token}`,
                },
                body: JSON.stringify({ label, payload }),
                keepalive: true,
            }).catch((error) => {
                console.error('Auto-hold purchase keepalive failed:', error);
            });

            lastAutoHoldSignatureRef.current = signature;
        };

        const handlePageHide = () => {
            autoHoldWithKeepAlive();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                autoHoldWithKeepAlive();
            }
        };

        window.addEventListener('pagehide', handlePageHide);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            void autoHoldCurrentPurchase();
        };
    }, []);

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

    const fetchHeldPurchases = async () => {
        try {
            const data = await holdPurchasesApi.list();
            setHeldPurchases(data || []);
        } catch (error) {
            console.error("Failed to fetch held purchases", error);
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
        if (!newProductName || !newProductSellingPrice) {
            alert('Please fill in required fields: Name and Selling Price');
            return;
        }
        
        try {
            setSavingProduct(true);
            const response = await api.post('/products/', {
                name: newProductName,
                sku: newProductSku.trim() || null,
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

    const clearPurchaseForm = () => {
        setVendorId('');
        setVendorSearch('');
        setItems([]);
        setAmountPaid('');
        setSelectedProduct(null);
        setProductSearch('');
        setQty('');
        setCost('');
        setExpiry('');
        setRetailPrice('');
        setUpdateRetailPrice(false);
    };

    const calculateHeldPurchaseTotal = (hold: HoldPurchaseResponse) => {
        return (hold.payload.items || []).reduce((sum, item) => sum + (item.total_cost || 0), 0);
    };

    const holdCurrentPurchase = async () => {
        if (!vendorId || items.length === 0) {
            alert("Please select a vendor and add at least one item");
            return;
        }

        const label = vendorSearch.trim() || `Vendor #${vendorId}`;
        const payload = {
            vendorId,
            vendorSearch,
            amountPaid,
            items,
        };

        try {
            await holdPurchasesApi.create({ label, payload });
            clearPurchaseForm();
            fetchHeldPurchases();
            setTimeout(() => productInputRef.current?.focus(), 50);
        } catch (error) {
            console.error("Failed to hold purchase", error);
            alert("Failed to hold purchase");
        }
    };

    const resumeHeldPurchase = async (hold: HoldPurchaseResponse) => {
        const payload = hold.payload;
        setVendorId(payload.vendorId || '');
        setVendorSearch(payload.vendorSearch || '');
        setAmountPaid(payload.amountPaid || '');
        setItems(payload.items || []);

        try {
            await holdPurchasesApi.delete(hold.id);
            fetchHeldPurchases();
        } catch (error) {
            console.error("Failed to remove held purchase", error);
        }
    };

    const deleteHeldPurchase = async (holdId: number) => {
        try {
            await holdPurchasesApi.delete(holdId);
            fetchHeldPurchases();
        } catch (error) {
            console.error("Failed to delete held purchase", error);
        }
    };

    const handleSubmit = async () => {
        if (!vendorId || items.length === 0) {
            alert("Please select a vendor and add at least one item");
            return;
        }

        try {
                        const response = await api.post('/purchases/', {
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
                        const vendor = vendors.find(v => v.id.toString() === vendorId);
                        setReceiptData({
                                title: "Purchase Receipt",
                            vendorId,
                                vendorName: vendor?.name || "Vendor",
                                total: response.data.total_amount || totalAmount,
                                paid: response.data.amount_paid || (amountPaid ? parseFloat(amountPaid) : 0),
                                date: response.data.created_at || new Date().toISOString(),
                                status: response.data.status || "unpaid",
                        });
                            clearPurchaseForm();

                        // Check for price changes
                        const changed = response.data?.price_changed_items || [];
                        if (changed.length > 0) {
                            const selections: Record<number, string> = {};
                            changed.forEach((c: any) => { selections[c.product_id] = 'keep'; });
                            setPriceUpdateSelections(selections);
                            setPriceChangedItems(changed);
                            setPriceChangeDialogOpen(true);
                        }

                        setReceiptDialogOpen(true);
        } catch (error) {
            console.error("Failed to submit purchase", error);
            alert("Failed to submit purchase");
        }
    };

        const handlePrintReceipt = () => {
                if (!receiptData) return;

                const content = `
                    <div style="font-family: Arial, sans-serif; max-width: 320px; margin: 0 auto; font-size: 12px;">
                        <div style="text-align:center; border-bottom:1px dashed #999; padding-bottom:8px; margin-bottom:8px;">
                            <div style="font-size:16px; font-weight:bold;">${storeInfo.name}</div>
                            ${storeInfo.address ? `<div>${storeInfo.address}</div>` : ""}
                            ${storeInfo.city ? `<div>${storeInfo.city}</div>` : ""}
                            ${storeInfo.phone ? `<div>${storeInfo.phone}</div>` : ""}
                            ${storeInfo.email ? `<div>${storeInfo.email}</div>` : ""}
                        </div>
                        <div style="text-align:center; font-weight:bold; margin-bottom:8px;">${receiptData.title}</div>
                        <div style="margin-bottom:8px;">
                            <div><strong>Vendor:</strong> ${receiptData.vendorName}</div>
                            <div><strong>Date:</strong> ${new Date(receiptData.date).toLocaleString()}</div>
                        </div>
                        <div style="border-top:1px dashed #999; border-bottom:1px dashed #999; padding:8px 0; margin:8px 0;">
                            <div style="display:flex; justify-content:space-between;"><span>Total</span><strong>rs ${receiptData.total.toFixed(2)}</strong></div>
                            <div style="display:flex; justify-content:space-between;"><span>Paid</span><strong>rs ${receiptData.paid.toFixed(2)}</strong></div>
                            <div style="display:flex; justify-content:space-between;"><span>Status</span><span>${receiptData.status}</span></div>
                        </div>
                        <div style="text-align:center; color:#777; margin-top:10px;">Thank you!</div>
                        ${storeInfo.website ? `<div style="text-align:center; color:#999;">${storeInfo.website}</div>` : ""}
                    </div>
                `;

                const printWindow = window.open("", "_blank", "width=400,height=600");
                if (!printWindow) return;
                printWindow.document.write(`
                    <html>
                        <head><title>Receipt</title></head>
                        <body>${content}</body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
                printWindow.close();
        };

    return (
        <div className="container mx-auto p-6 max-w-[1400px] h-full overflow-y-auto">
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

                    <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
                        <DialogContent className="sm:max-w-[420px]">
                            <DialogHeader>
                                <DialogTitle>{receiptData?.title || "Receipt"}</DialogTitle>
                                <DialogDescription>
                                    Purchase receipt.
                                </DialogDescription>
                            </DialogHeader>

                            {receiptData && (
                                <div className="space-y-3 text-sm">
                                    <div className="text-center border-b border-dashed pb-2">
                                        <div className="text-base font-semibold">{storeInfo.name}</div>
                                        {storeInfo.address && <div>{storeInfo.address}</div>}
                                        {storeInfo.city && <div>{storeInfo.city}</div>}
                                        {storeInfo.phone && <div>{storeInfo.phone}</div>}
                                    </div>
                                    <div>
                                        <div><span className="font-medium">Vendor:</span> {receiptData.vendorName}</div>
                                        <div><span className="font-medium">Date:</span> {new Date(receiptData.date).toLocaleString()}</div>
                                    </div>
                                    <div className="border-t border-b border-dashed py-2">
                                        <div className="flex justify-between">
                                            <span>Total</span>
                                            <span className="font-semibold">rs {receiptData.total.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Paid</span>
                                            <span className="font-semibold">rs {receiptData.paid.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Status</span>
                                            <span>{receiptData.status}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <DialogFooter>
                                <Button variant="outline" onClick={() => {
                                    setReceiptDialogOpen(false);
                                    if (receiptData?.vendorId) {
                                        router.push(`/vendors/${receiptData.vendorId}`);
                                    }
                                }}>
                                    Close
                                </Button>
                                <Button onClick={handlePrintReceipt}>Print Receipt</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
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
                            variant="outline"
                            size="lg"
                            onClick={holdCurrentPurchase}
                            disabled={!vendorId || items.length === 0}
                        >
                            Hold Purchase
                        </Button>

                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => setHeldOpen((prev) => !prev)}
                        >
                            {heldOpen ? 'Hide Held' : `Show Held (${heldPurchases.length})`}
                        </Button>

                        <Button
                            className="w-full"
                            size="lg"
                            onClick={handleSubmit}
                            disabled={!vendorId || items.length === 0}
                        >
                            Confirm Purchase Order
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>

                        {heldOpen && (
                            <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold">Held Purchases</h3>
                                    <span className="text-sm text-muted-foreground">{heldPurchases.length} saved</span>
                                </div>

                                {heldPurchases.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No held purchases.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {heldPurchases.map((hold) => (
                                            <div key={hold.id} className="flex items-center justify-between gap-3 rounded border bg-white p-3">
                                                <div>
                                                    <div className="font-medium">{hold.label || 'Held Purchase'}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {hold.payload.items?.length || 0} items • rs {calculateHeldPurchaseTotal(hold).toFixed(2)}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button size="sm" onClick={() => void resumeHeldPurchase(hold)}>
                                                        Resume
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => void deleteHeldPurchase(hold.id)}>
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
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
                                    SKU (Optional)
                                </Label>
                                <Input
                                    id="productSku"
                                    value={newProductSku}
                                    onChange={(e) => setNewProductSku(e.target.value)}
                                    placeholder="Leave blank for auto-generated SKU"
                                />
                                <p className="text-xs text-muted-foreground">
                                    If left empty, SKU is auto-generated from product name.
                                </p>
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

            {/* Price Changed Dialog */}
            <Dialog open={priceChangeDialogOpen} onOpenChange={setPriceChangeDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Cost Price Changed — Update Selling Price?</DialogTitle>
                        <DialogDescription>
                            The following products were purchased at a different cost. Choose how to update the selling price.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 max-h-80 overflow-y-auto">
                        {priceChangedItems.map((item: any) => (
                            <div key={item.product_id} className="border rounded-lg p-3 bg-gray-50">
                                <div className="font-semibold mb-1">{item.product_name}</div>
                                <div className="text-xs text-gray-500 mb-2">
                                    Cost: Rs {item.old_cost} → Rs {item.new_cost} &nbsp;|&nbsp; Current Selling: Rs {item.current_selling_price}
                                </div>
                                <Select
                                    value={priceUpdateSelections[item.product_id] || 'keep'}
                                    onValueChange={v => setPriceUpdateSelections(prev => ({ ...prev, [item.product_id]: v }))}
                                >
                                    <SelectTrigger className="text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="keep">Keep current (Rs {item.current_selling_price})</SelectItem>
                                        <SelectItem value="suggested">Use suggested (Rs {item.suggested_selling_price})</SelectItem>
                                        <SelectItem value={String(item.new_cost)}>Set to new cost (Rs {item.new_cost})</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPriceChangeDialogOpen(false)}>Skip</Button>
                        <Button
                            onClick={async () => {
                                try {
                                    for (const item of priceChangedItems) {
                                        const sel = priceUpdateSelections[item.product_id];
                                        if (sel === 'keep') continue;
                                        const newPrice = sel === 'suggested' ? item.suggested_selling_price : parseFloat(sel);
                                        if (!isNaN(newPrice) && newPrice > 0) {
                                            await api.patch(`/products/${item.product_id}`, { selling_price: newPrice });
                                        }
                                    }
                                    setPriceChangeDialogOpen(false);
                                } catch {
                                    alert("Some selling prices could not be updated.");
                                }
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            Apply
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
