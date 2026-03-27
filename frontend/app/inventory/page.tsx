'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import JsBarcode from 'jsbarcode';
import { Button } from "@/components/ui/button";
import { Plus, Search, Tag, Package, Edit, Trash2, Grid3x3, TrendingUp, Filter, Download, Barcode, Printer } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface SellingUnit {
    unit: string;
    conversion: number;
    price: number;
}

interface ProductVariation {
    id: number;
    product_id: number;
    attributes: Record<string, string>;
    sku: string | null;
    price_adjustment: number;
    quantity: number;
    barcode: string | null;
}

interface Product {
    id: number;
    name: string;
    sku: string | null;
    category: string;
    selling_price: number;
    cost_price: number;
    quantity: number;
    allow_decimal_qty: boolean;
    has_variations: boolean;
    variation_attributes: string[];
    base_unit: string;
    selling_units: SellingUnit[];
    variations?: ProductVariation[];
}

export default function InventoryPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('All');
    const [stockFilter, setStockFilter] = useState<string>('all');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(100);
    const [totalCount, setTotalCount] = useState(0);
    const fetchRequestIdRef = useRef(0);
    const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
    const [barcodeOpen, setBarcodeOpen] = useState(false);
    const [barcodeCopies, setBarcodeCopies] = useState(1);
    const barcodeRef = useRef<SVGSVGElement | null>(null);

    const barcodeCallbackRef = useCallback((node: SVGSVGElement | null) => {
        barcodeRef.current = node;
        if (!node || !barcodeProduct) return;
        const value = barcodeProduct.sku || `ID-${barcodeProduct.id}`;
        try {
            JsBarcode(node, value, {
                format: 'CODE128',
                displayValue: true,
                fontSize: 13,
                height: 60,
                margin: 10,
                width: 2,
            });
        } catch {
            JsBarcode(node, `ID-${barcodeProduct.id}`, {
                format: 'CODE128',
                displayValue: true,
                fontSize: 13,
                height: 60,
                margin: 10,
                width: 2,
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [barcodeProduct]);

    // Form State
    const [name, setName] = useState('');
    const [sku, setSku] = useState('');
    const [category, setCategory] = useState('');
    const [sellingPrice, setSellingPrice] = useState('');
    const [hasVariations, setHasVariations] = useState(false);
    const [allowDecimalQty, setAllowDecimalQty] = useState(false);
    const [variationAttributes, setVariationAttributes] = useState<string[]>([]);
    const [newAttribute, setNewAttribute] = useState('');
    const [baseUnit, setBaseUnit] = useState('piece');
    const [sellingUnits, setSellingUnits] = useState<SellingUnit[]>([]);
    const [hasSellingUnits, setHasSellingUnits] = useState(false);
    const [newUnit, setNewUnit] = useState({ unit: '', conversion: '1', price: '' });

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts();
        }, 500);
        return () => clearTimeout(timer);
    }, [search, categoryFilter, stockFilter, page]);

    useEffect(() => {
        setPage(1);
    }, [search, categoryFilter, stockFilter]);

    const fetchProducts = async () => {
        const requestId = ++fetchRequestIdRef.current;
        try {
            setLoading(true);
            const { data: countData } = await api.get('/products/count', {
                params: {
                    search: search || undefined,
                    category: categoryFilter !== 'All' ? categoryFilter : undefined
                }
            });
            if (requestId !== fetchRequestIdRef.current) {
                return;
            }
            setTotalCount(countData?.total || 0);
            const { data } = await api.get('/products/', {
                params: {
                    search: search || undefined,
                    category: categoryFilter !== 'All' ? categoryFilter : undefined,
                    skip: (page - 1) * pageSize,
                    limit: pageSize,
                }
            });
            if (requestId !== fetchRequestIdRef.current) {
                return;
            }

            // Apply stock filter on frontend
            let filtered = data;
            if (stockFilter === 'low') {
                filtered = data.filter((p: Product) => p.quantity > 0 && p.quantity <= 10);
            } else if (stockFilter === 'out') {
                filtered = data.filter((p: Product) => p.quantity <= 0);
            } else if (stockFilter === 'in') {
                filtered = data.filter((p: Product) => p.quantity > 0);
            }

            setProducts(filtered);
        } catch (error) {
            console.error("Failed to fetch products", error);
        } finally {
            if (requestId === fetchRequestIdRef.current) {
                setLoading(false);
            }
        }
    };

    // Get unique categories
    const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];


    const handleCreateProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/products/', {
                name,
                sku: sku.trim() || null,
                category: category || "Uncategorized",
                selling_price: parseFloat(sellingPrice),
                has_variations: hasVariations,
                allow_decimal_qty: allowDecimalQty,
                variation_attributes: variationAttributes,
                base_unit: baseUnit,
                selling_units: hasSellingUnits ? sellingUnits : [],
                // cost_price & quantity set via Purchase Flow
            });
            setOpen(false);
            resetForm();
            fetchProducts();
        } catch (error: any) {
            console.error("Failed to create product", error);
            alert(error?.response?.data?.detail || "Failed to create product.");
        }
    };

    const resetForm = () => {
        setName('');
        setSku('');
        setCategory('');
        setSellingPrice('');
        setHasVariations(false);
        setAllowDecimalQty(false);
        setVariationAttributes([]);
        setNewAttribute('');
        setBaseUnit('piece');
        setSellingUnits([]);
        setHasSellingUnits(false);
        setNewUnit({ unit: '', conversion: '1', price: '' });
    };

    const addAttribute = () => {
        if (newAttribute.trim() && !variationAttributes.includes(newAttribute.trim())) {
            setVariationAttributes([...variationAttributes, newAttribute.trim()]);
            setNewAttribute('');
        }
    };

    const removeAttribute = (attr: string) => {
        setVariationAttributes(variationAttributes.filter(a => a !== attr));
    };

    const addSellingUnit = () => {
        if (newUnit.unit && newUnit.conversion && newUnit.price) {
            setSellingUnits([...sellingUnits, {
                unit: newUnit.unit,
                conversion: parseFloat(newUnit.conversion),
                price: parseFloat(newUnit.price)
            }]);
            setNewUnit({ unit: '', conversion: '1', price: '' });
        }
    };

    const removeSellingUnit = (index: number) => {
        setSellingUnits(sellingUnits.filter((_, i) => i !== index));
    };

    const openEditDialog = (product: Product) => {
        setSelectedProduct(product);
        setName(product.name);
        setSku(product.sku || '');
        setCategory(product.category);
        setSellingPrice(product.selling_price.toString());
        setHasVariations(product.has_variations);
        setAllowDecimalQty(product.allow_decimal_qty);
        setVariationAttributes(product.variation_attributes || []);
        setBaseUnit(product.base_unit);
        setSellingUnits(product.selling_units || []);
        setHasSellingUnits((product.selling_units || []).length > 0);
        setEditOpen(true);
    };

    const handleEditProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct) return;

        try {
            await api.put(`/products/${selectedProduct.id}`, {
                name,
                sku: sku.trim() || null,
                category: category || "Uncategorized",
                selling_price: parseFloat(sellingPrice),
                has_variations: hasVariations,
                allow_decimal_qty: allowDecimalQty,
                variation_attributes: variationAttributes,
                base_unit: baseUnit,
                selling_units: hasSellingUnits ? sellingUnits : [],
            });
            setEditOpen(false);
            resetForm();
            setSelectedProduct(null);
            fetchProducts();
        } catch (error: any) {
            console.error("Failed to update product", error);
            alert(error?.response?.data?.detail || "Failed to update product.");
        }
    };

    const openDeleteDialog = (product: Product) => {
        setSelectedProduct(product);
        setDeleteDialogOpen(true);
    };

    const handleDeleteProduct = async () => {
        if (!selectedProduct) return;

        try {
            await api.delete(`/products/${selectedProduct.id}`);
            setDeleteDialogOpen(false);
            setSelectedProduct(null);
            fetchProducts();
        } catch (error) {
            console.error("Failed to delete product", error);
            alert("Failed to delete product.");
        }
    };

    const handleBulkImport = async () => {
        if (!bulkFile) {
            alert("Please select a CSV file");
            return;
        }

        const formData = new FormData();
        formData.append('file', bulkFile);

        setBulkUploading(true);
        try {
            const { data } = await api.post('/products/bulk-import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setBulkResult(data);
            fetchProducts();
        } catch (error: any) {
            console.error("Failed to import products", error);
            alert(error?.response?.data?.detail || "Failed to import products");
        } finally {
            setBulkUploading(false);
        }
    };

    const handleDownloadCsv = async () => {
        try {
            const response = await api.get('/products/export-csv', {
                responseType: 'blob',
            });
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'products.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error("Failed to download products CSV", error);
            alert(error?.response?.data?.detail || "Failed to download products CSV");
        }
    };

    const openVariationBuilder = async (product: Product) => {
        router.push(`/inventory/variations/${product.id}`);
    };

    const openBarcodeDialog = (product: Product) => {
        setBarcodeProduct(product);
        setBarcodeCopies(1);
        setBarcodeOpen(true);
    };

    const handlePrintBarcode = () => {
        if (!barcodeRef.current || !barcodeProduct) return;
        const svgContent = barcodeRef.current.outerHTML;
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) return;
        const copies = Array(barcodeCopies).fill(null).map(() => `
            <div class="label">
                <div class="prod-name">${barcodeProduct.name}</div>
                ${svgContent}
                <div class="prod-price">Rs ${barcodeProduct.selling_price.toFixed(2)}</div>
            </div>
        `).join('');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Barcode — ${barcodeProduct.name}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: sans-serif; padding: 8px; }
                    .labels { display: flex; flex-wrap: wrap; gap: 6px; }
                    .label { display: flex; flex-direction: column; align-items: center; border: 1px dashed #ccc; padding: 6px 4px; page-break-inside: avoid; }
                    .prod-name { font-size: 10px; font-weight: 600; text-align: center; max-width: 180px; margin-bottom: 2px; }
                    .prod-price { font-size: 12px; font-weight: bold; margin-top: 2px; }
                    svg { max-width: 180px; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="labels">${copies}</div>
                <script>window.onload = () => { window.print(); window.close(); }<\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const isAdmin = user?.role === 'admin';

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Product Catalog</h1>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="text-gray-500">Define the items you sell. Manage stock via Purchases.</p>
                        <Badge variant="secondary" className="font-normal">
                            Total Products: {totalCount}
                        </Badge>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleDownloadCsv}>
                        <Download className="mr-2 h-4 w-4" /> Download CSV
                    </Button>
                    <Dialog open={bulkOpen} onOpenChange={(nextOpen) => {
                        setBulkOpen(nextOpen);
                        if (!nextOpen) {
                            setBulkFile(null);
                            setBulkResult(null);
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button variant="outline">
                                <Plus className="mr-2 h-4 w-4" /> Bulk Import (CSV)
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[520px]">
                            <DialogHeader>
                                <DialogTitle>Bulk Import Products</DialogTitle>
                                <DialogDescription>
                                    Upload a CSV file with columns: name, sku, category, description, selling_price, cost_price, quantity, base_unit, has_variations, allow_decimal_qty, variation_attributes, selling_units_json
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="products_csv">CSV File</Label>
                                    <Input
                                        id="products_csv"
                                        type="file"
                                        accept=".csv"
                                        onChange={e => setBulkFile(e.target.files?.[0] || null)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {"JSON columns must be valid. Example: [\"Size\", \"Color\"] and [{\"unit\":\"piece\",\"conversion\":1,\"price\":10}]"}
                                    </p>
                                </div>
                                {bulkResult && (
                                    <div className="rounded-md border p-3 text-sm">
                                        <div>Created: {bulkResult.created}</div>
                                        <div>Skipped: {bulkResult.skipped}</div>
                                        {bulkResult.errors.length > 0 && (
                                            <div className="mt-2 text-xs text-red-600 space-y-1 max-h-32 overflow-auto">
                                                {bulkResult.errors.map((err, idx) => (
                                                    <div key={idx}>{err}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkUploading}>
                                    Close
                                </Button>
                                <Button onClick={handleBulkImport} disabled={bulkUploading || !bulkFile}>
                                    {bulkUploading ? "Importing..." : "Import Products"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-emerald-600 hover:bg-emerald-700 shadow-sm">
                                <Plus className="mr-2 h-4 w-4" /> Define New Product
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Define New Product</DialogTitle>
                                <DialogDescription>
                                    Create a new item definition. Stock is added separately in "Purchases".
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateProduct} className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Product Name</Label>
                                    <Input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Coca Cola Can" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="sku">SKU / Barcode</Label>
                                        <Input id="sku" value={sku} onChange={e => setSku(e.target.value)} placeholder="Leave blank for auto-generated SKU" />
                                        <p className="text-xs text-gray-500">If left empty, SKU is auto-generated from product name.</p>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="category">Category</Label>
                                        <Input id="category" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Beverages" />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="price">Selling Price (rs)</Label>
                                    <Input id="price" type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} required placeholder="0.00" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="allow-decimal-qty"
                                        checked={allowDecimalQty}
                                        onChange={e => setAllowDecimalQty(e.target.checked)}
                                    />
                                    <Label htmlFor="allow-decimal-qty">Allow decimal quantity (points, e.g. 0.5)</Label>
                                </div>

                                {/* Unit of Measure */}
                                <div className="grid gap-2">
                                    <Label htmlFor="base-unit">Base Unit</Label>
                                    <Input id="base-unit" value={baseUnit} onChange={e => setBaseUnit(e.target.value)} placeholder="piece, kg, liter" />
                                    <p className="text-xs text-gray-500">Unit for inventory tracking</p>
                                </div>

                                {/* Selling Units */}
                                <div className="border-t pt-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <input
                                            type="checkbox"
                                            id="has-selling-units"
                                            checked={hasSellingUnits}
                                            onChange={e => {
                                                const next = e.target.checked;
                                                setHasSellingUnits(next);
                                                if (!next) {
                                                    setSellingUnits([]);
                                                    setNewUnit({ unit: '', conversion: '1', price: '' });
                                                }
                                            }}
                                        />
                                        <Label htmlFor="has-selling-units">Additional selling units (dozen, pack, etc.)</Label>
                                    </div>

                                    {hasSellingUnits && (
                                        <div className="grid gap-2">
                                            <Label>Additional Selling Units</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="Unit (dozen)"
                                                    value={newUnit.unit}
                                                    onChange={e => setNewUnit({ ...newUnit, unit: e.target.value })}
                                                    className="flex-1"
                                                />
                                                <Input
                                                    placeholder="Conv (12)"
                                                    type="number"
                                                    step="any"
                                                    value={newUnit.conversion}
                                                    onChange={e => setNewUnit({ ...newUnit, conversion: e.target.value })}
                                                    className="w-24"
                                                />
                                                <Input
                                                    placeholder="Price"
                                                    type="number"
                                                    step="0.01"
                                                    value={newUnit.price}
                                                    onChange={e => setNewUnit({ ...newUnit, price: e.target.value })}
                                                    className="w-24"
                                                />
                                                <Button type="button" size="sm" onClick={addSellingUnit}>+</Button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {sellingUnits.map((unit, idx) => (
                                                    <Badge key={idx} variant="secondary" className="gap-2">
                                                        {unit.unit} (×{unit.conversion}) rs {unit.price}
                                                        <button type="button" onClick={() => removeSellingUnit(idx)} className="ml-1">×</button>
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Variations */}
                                <div className="border-t pt-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <input
                                            type="checkbox"
                                            id="has-variations"
                                            checked={hasVariations}
                                            onChange={e => setHasVariations(e.target.checked)}
                                        />
                                        <Label htmlFor="has-variations">This product has variations (Size, Color, etc.)</Label>
                                    </div>

                                    {hasVariations && (
                                        <div className="grid gap-2 mt-2">
                                            <Label>Variation Attributes</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="e.g. Size, Color, Material"
                                                    value={newAttribute}
                                                    onChange={e => setNewAttribute(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAttribute())}
                                                />
                                                <Button type="button" size="sm" onClick={addAttribute}>Add</Button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {variationAttributes.map(attr => (
                                                    <Badge key={attr} variant="secondary" className="gap-2">
                                                        {attr}
                                                        <button type="button" onClick={() => removeAttribute(attr)} className="ml-1">×</button>
                                                    </Badge>
                                                ))}
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                After creating the product, use "Manage Variations" to define specific options
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-yellow-50 p-3 rounded-md text-xs text-yellow-700 border border-yellow-200">
                                    Note: Initial quantity will be 0. Use the <strong>Purchases</strong> module to add stock from a vendor.
                                </div>

                                <DialogFooter>
                                    <Button type="submit">Save Definition</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="space-y-4">
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search products by name or SKU..."
                            className="pl-10"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="w-full sm:w-48">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                            {categories.map(cat => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={stockFilter} onValueChange={setStockFilter}>
                        <SelectTrigger className="w-full sm:w-48">
                            <Package className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Stock Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Stock</SelectItem>
                            <SelectItem value="in">In Stock</SelectItem>
                            <SelectItem value="low">Low Stock (≤10)</SelectItem>
                            <SelectItem value="out">Out of Stock</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50">
                                <TableHead>Product Name</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">Selling Price</TableHead>
                                <TableHead className="text-center">Current Stock</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.map((product) => (
                                <TableRow key={product.id} className="hover:bg-gray-50/50 transition-colors">
                                    <TableCell className="font-medium text-gray-900">
                                        {product.name}
                                        {product.has_variations && (
                                            <Badge variant="outline" className="ml-2 text-xs">
                                                <Grid3x3 className="h-3 w-3 mr-1" />
                                                Variations
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-gray-500">{product.sku || '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="font-normal">{product.category}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium text-emerald-600">
                                        rs {product.selling_price.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={product.quantity > 0 ? "outline" : "secondary"} className={product.quantity > 0 ? "text-blue-600 border-blue-200" : "bg-red-100 text-red-600 border-red-200"}>
                                            {product.quantity > 0 ? product.quantity : `0 - Out of Stock`}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openBarcodeDialog(product)}
                                                className="hover:bg-orange-50 hover:text-orange-600"
                                                title="Generate Barcode"
                                            >
                                                <Barcode className="h-4 w-4" />
                                            </Button>
                                            {isAdmin && product.has_variations && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openVariationBuilder(product)}
                                                    className="hover:bg-purple-50 hover:text-purple-600"
                                                    title="Manage Variations"
                                                >
                                                    <Grid3x3 className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {isAdmin && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openEditDialog(product)}
                                                    className="hover:bg-blue-50 hover:text-blue-600"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {isAdmin && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openDeleteDialog(product)}
                                                    className="hover:bg-red-50 hover:text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {products.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={isAdmin ? 6 : 5} className="h-32 text-center text-gray-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Package className="h-8 w-8 text-gray-300" />
                                            <p>No products found. Start by defining your first item.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        {totalCount === 0
                            ? "Showing 0 of 0"
                            : `Showing ${(page - 1) * pageSize + 1}-${(page - 1) * pageSize + products.length} of ${totalCount}`}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => p + 1)}
                            disabled={page * pageSize >= totalCount || loading}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </div>

            {/* Edit Product Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Edit Product</DialogTitle>
                        <DialogDescription>
                            Update product information. Stock is managed separately via Purchases.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEditProduct} className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">Product Name</Label>
                            <Input id="edit-name" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit-sku">SKU / Barcode</Label>
                                <Input id="edit-sku" value={sku} onChange={e => setSku(e.target.value)} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-category">Category</Label>
                                <Input id="edit-category" value={category} onChange={e => setCategory(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-price">Selling Price (rs)</Label>
                            <Input id="edit-price" type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} required />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="edit-allow-decimal-qty"
                                checked={allowDecimalQty}
                                onChange={e => setAllowDecimalQty(e.target.checked)}
                            />
                            <Label htmlFor="edit-allow-decimal-qty">Allow decimal quantity (points, e.g. 0.5)</Label>
                        </div>

                        {/* Selling Units */}
                        <div className="border-t pt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <input
                                    type="checkbox"
                                    id="edit-has-selling-units"
                                    checked={hasSellingUnits}
                                    onChange={e => {
                                        const next = e.target.checked;
                                        setHasSellingUnits(next);
                                        if (!next) {
                                            setSellingUnits([]);
                                            setNewUnit({ unit: '', conversion: '1', price: '' });
                                        }
                                    }}
                                />
                                <Label htmlFor="edit-has-selling-units">Additional selling units (dozen, pack, etc.)</Label>
                            </div>

                            {hasSellingUnits && (
                                <div className="grid gap-2">
                                    <Label>Additional Selling Units</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Unit (dozen)"
                                            value={newUnit.unit}
                                            onChange={e => setNewUnit({ ...newUnit, unit: e.target.value })}
                                            className="flex-1"
                                        />
                                        <Input
                                            placeholder="Conv (12)"
                                            type="number"
                                            step="any"
                                            value={newUnit.conversion}
                                            onChange={e => setNewUnit({ ...newUnit, conversion: e.target.value })}
                                            className="w-24"
                                        />
                                        <Input
                                            placeholder="Price"
                                            type="number"
                                            step="0.01"
                                            value={newUnit.price}
                                            onChange={e => setNewUnit({ ...newUnit, price: e.target.value })}
                                            className="w-24"
                                        />
                                        <Button type="button" size="sm" onClick={addSellingUnit}>+</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {sellingUnits.map((unit, idx) => (
                                            <Badge key={idx} variant="secondary" className="gap-2">
                                                {unit.unit} (×{unit.conversion}) rs {unit.price}
                                                <button type="button" onClick={() => removeSellingUnit(idx)} className="ml-1">×</button>
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="border-t pt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <input
                                    type="checkbox"
                                    id="edit-has-variations"
                                    checked={hasVariations}
                                    onChange={e => setHasVariations(e.target.checked)}
                                />
                                <Label htmlFor="edit-has-variations">This product has variations (Size, Color, etc.)</Label>
                            </div>

                            {hasVariations && (
                                <div className="grid gap-2 mt-2">
                                    <Label>Variation Attributes</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="e.g. Size, Color, Material"
                                            value={newAttribute}
                                            onChange={e => setNewAttribute(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAttribute())}
                                        />
                                        <Button type="button" size="sm" onClick={addAttribute}>Add</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {variationAttributes.map(attr => (
                                            <Badge key={attr} variant="secondary" className="gap-2">
                                                {attr}
                                                <button type="button" onClick={() => removeAttribute(attr)} className="ml-1">×</button>
                                            </Badge>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        If this product already has variation records, disabling variations will be blocked.
                                    </p>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">Save Changes</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Barcode Dialog */}
            <Dialog open={barcodeOpen} onOpenChange={setBarcodeOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Barcode className="h-5 w-5 text-orange-500" />
                            Barcode Label
                        </DialogTitle>
                        <DialogDescription>
                            {barcodeProduct?.name} — SKU: {barcodeProduct?.sku || `ID-${barcodeProduct?.id}`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4 py-4">
                        <div className="border rounded-lg p-4 bg-white">
                            <svg ref={barcodeCallbackRef} />
                        </div>
                        <div className="flex items-center gap-3">
                            <Label htmlFor="barcode-copies">Print Copies</Label>
                            <Input
                                id="barcode-copies"
                                type="number"
                                min={1}
                                max={200}
                                value={barcodeCopies}
                                onChange={e => setBarcodeCopies(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-20"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBarcodeOpen(false)}>Close</Button>
                        <Button onClick={handlePrintBarcode} className="bg-orange-500 hover:bg-orange-600 text-white">
                            <Printer className="mr-2 h-4 w-4" />
                            Print {barcodeCopies > 1 ? `${barcodeCopies} Copies` : 'Label'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete <span className="font-semibold text-gray-900">{selectedProduct?.name}</span>.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteProduct} className="bg-red-600 hover:bg-red-700">
                            Delete Product
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
