'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { ArrowLeft, DollarSign, Package, Calendar, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface EditablePurchaseItem {
    product_id: number;
    product_search: string;
    variation_id?: number | null;
    quantity: number;
    unit_cost: number;
    expiry_date?: string | null;
}

export default function PurchaseDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [purchase, setPurchase] = useState<any>(null);
    const [vendor, setVendor] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editableItems, setEditableItems] = useState<EditablePurchaseItem[]>([]);
    const [activeProductRow, setActiveProductRow] = useState<number | null>(null);
    const [allowDecimals, setAllowDecimals] = useState(false);

    useEffect(() => {
        if (id) {
            fetchData();
        }
    }, [id]);

    const fetchData = async () => {
        try {
            // Fetch purchase details
            const purchaseRes = await api.get(`/purchases/${id}`);
            setPurchase(purchaseRes.data);

            // Fetch vendor details
            const vendorsRes = await api.get('/vendors/');
            const vendorData = vendorsRes.data.find((v: any) => v.id === purchaseRes.data.vendor_id);
            setVendor(vendorData);

            // Fetch product details for items
            const productsRes = await api.get('/products/', {
                params: { limit: 1000 }
            });
            setProducts(productsRes.data || []);
        } catch (error) {
            console.error("Failed to fetch purchase details", error);
        } finally {
            setLoading(false);
        }
    };

    const getProductName = (productId: number) => {
        const product = products.find(p => p.id === productId);
        return product ? product.name : `Product #${productId}`;
    };

    const handleUpdatePayment = async () => {
        try {
            await api.put(`/purchases/${id}/payment`, {
                amount_paid: parseFloat(paymentAmount)
            });
            setPaymentDialogOpen(false);
            fetchData(); // Refresh data
        } catch (error) {
            console.error("Failed to update payment", error);
            alert("Failed to update payment");
        }
    };

    const openEditDialog = () => {
        if (!purchase) return;
        setEditableItems(
            (purchase.items || []).map((item: any) => ({
                product_id: item.product_id,
                product_search: getProductName(item.product_id),
                variation_id: item.variation_id || null,
                quantity: item.quantity,
                unit_cost: item.unit_cost,
                expiry_date: item.expiry_date ? new Date(item.expiry_date).toISOString().slice(0, 10) : null,
            }))
        );
        setEditDialogOpen(true);
    };

    const updateEditableItem = (index: number, field: keyof EditablePurchaseItem, value: any) => {
        setEditableItems((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const removeEditableItem = (index: number) => {
        setEditableItems((prev) => prev.filter((_, idx) => idx !== index));
    };

    const addEditableItem = () => {
        if (products.length === 0) {
            alert("No products available. Please create a product first.");
            return;
        }
        setEditableItems((prev) => [
            ...prev,
            {
                product_id: products[0].id,
                product_search: products[0].name,
                variation_id: null,
                quantity: 1,
                unit_cost: 0,
                expiry_date: null,
            }
        ]);
    };

    const handleSaveEditedPurchase = async () => {
        if (!purchase) return;
        if (editableItems.length === 0) {
            alert("At least one purchase item is required.");
            return;
        }

        const invalidItem = editableItems.find((item) => item.quantity <= 0 || item.unit_cost < 0);
        if (invalidItem) {
            alert("Please ensure quantity > 0 and unit cost >= 0 for all items.");
            return;
        }

        try {
            setSavingEdit(true);
            await api.put(`/purchases/${id}`, {
                vendor_id: purchase.vendor_id,
                amount_paid: purchase.amount_paid,
                items: editableItems.map((item) => ({
                    product_id: item.product_id,
                    variation_id: item.variation_id || null,
                    quantity: item.quantity,
                    unit_cost: item.unit_cost,
                    expiry_date: item.expiry_date ? new Date(item.expiry_date).toISOString() : null,
                    update_selling_price: false,
                })),
            });

            setEditDialogOpen(false);
            await fetchData();
            alert("Purchase updated successfully.");
        } catch (error: any) {
            console.error("Failed to update purchase", error);
            alert(error?.response?.data?.detail || "Failed to update purchase");
        } finally {
            setSavingEdit(false);
        }
    };

    const getFilteredProducts = (query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return products.slice(0, 20);
        return products
            .filter((p) =>
                p.name.toLowerCase().includes(q) ||
                (p.sku || '').toLowerCase().includes(q)
            )
            .slice(0, 20);
    };

    if (loading) return <div className="h-full flex items-center justify-center">Loading...</div>;
    if (!purchase) return <div className="h-full flex items-center justify-center">Purchase not found</div>;

    const balance = purchase.total_amount - purchase.amount_paid;

    return (
        <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto space-y-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Purchase #{purchase.id}</h1>
                    <p className="text-gray-500 mt-2">
                        <Calendar className="inline h-4 w-4 mr-1" />
                        {new Date(purchase.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </p>
                    {vendor && (
                        <p className="text-sm text-gray-400 mt-1">
                            Vendor: <span className="font-medium text-gray-600">{vendor.name}</span>
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={openEditDialog}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit Purchase
                    </Button>
                    <Badge
                        variant="outline"
                        className={`text-lg px-4 py-2 ${purchase.status === 'paid' ? 'bg-green-100 text-green-700 border-green-200' :
                            purchase.status === 'partial' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                'bg-red-100 text-red-700 border-red-200'
                            }`}
                    >
                        {purchase.status.toUpperCase()}
                    </Badge>
                </div>
            </div>

            {/* Payment Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Total Amount</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${purchase.total_amount.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Amount Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">${purchase.amount_paid.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card className={balance > 0 ? "border-red-200 bg-red-50" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Balance Due</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${balance > 0 ? "text-red-600" : "text-gray-900"}`}>
                            ${balance.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{purchase.items.length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Payment Update Button */}
            {balance > 0 && (
                <Card className="border-yellow-200 bg-yellow-50">
                    <CardContent className="flex items-center justify-between p-6">
                        <div>
                            <h3 className="font-semibold text-yellow-900">Outstanding Balance</h3>
                            <p className="text-sm text-yellow-700">
                                This purchase has a remaining balance of ${balance.toFixed(2)}
                            </p>
                        </div>
                        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-yellow-600 hover:bg-yellow-700">
                                    <DollarSign className="mr-2 h-4 w-4" /> Make Payment
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[95vw] max-w-6xl lg:max-w-7xl max-h-[85vh] overflow-y-auto p-6">
                                <DialogHeader>
                                    <DialogTitle>Update Payment</DialogTitle>
                                    <DialogDescription>
                                        Enter the total amount paid for this purchase.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="payment">Total Amount Paid ($)</Label>
                                        <Input
                                            id="payment"
                                            type="number"
                                            step="0.01"
                                            value={paymentAmount}
                                            onChange={e => setPaymentAmount(e.target.value)}
                                            placeholder={purchase.amount_paid.toFixed(2)}
                                        />
                                        <p className="text-xs text-gray-500">
                                            Current: ${purchase.amount_paid.toFixed(2)} |
                                            Total: ${purchase.total_amount.toFixed(2)} |
                                            Balance: ${balance.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleUpdatePayment}>
                                        Update Payment
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
            )}

            {/* Purchase Items */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Purchase Items
                </h2>
                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50">
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                                <TableHead className="text-right">Unit Cost</TableHead>
                                <TableHead className="text-right">Total Cost</TableHead>
                                <TableHead>Expiry Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {purchase.items.map((item: any) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">
                                        {getProductName(item.product_id)}
                                    </TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-right">${item.unit_cost.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-medium">${item.total_cost.toFixed(2)}</TableCell>
                                    <TableCell className="text-sm text-gray-500">
                                        {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Totals */}
            <Card>
                <CardContent className="p-6">
                    <div className="space-y-2">
                        <div className="flex justify-between text-lg">
                            <span className="text-gray-600">Subtotal:</span>
                            <span className="font-medium">${purchase.total_amount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-lg border-t pt-2">
                            <span className="text-gray-600">Paid:</span>
                            <span className="font-medium text-green-600">${purchase.amount_paid.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold border-t-2 pt-2">
                            <span>Balance Due:</span>
                            <span className={balance > 0 ? "text-red-600" : "text-gray-900"}>
                                ${balance.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="w-[95vw] sm:max-w-7xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Purchase #{purchase.id}</DialogTitle>
                        <DialogDescription>
                            Changes will update stock, vendor accounting, and payable balances.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <h3 className="font-semibold">Items</h3>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="allowDecimals"
                                        checked={allowDecimals}
                                        onCheckedChange={(checked) => setAllowDecimals(checked as boolean)}
                                    />
                                    <Label htmlFor="allowDecimals" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        Allow Decimals?
                                    </Label>
                                </div>
                            </div>
                            <Button type="button" variant="outline" onClick={addEditableItem}>
                                <Plus className="mr-2 h-4 w-4" /> Add Product
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {editableItems.map((item, index) => (
                                <div
                                    key={index}
                                    className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border rounded-md p-4"
                                >
                                    {/* Product */}
                                    <div className="md:col-span-5 relative">
                                        <Label className="text-xs">Product</Label>
                                        <Input
                                            value={item.product_search}
                                            placeholder="Type product name or SKU..."
                                            onFocus={() => setActiveProductRow(index)}
                                            onChange={(e) => updateEditableItem(index, "product_search", e.target.value)}
                                        />

                                        {activeProductRow === index && (
                                            <div className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                                                {getFilteredProducts(item.product_search).map((p) => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            setEditableItems((prev) => {
                                                                const next = [...prev];
                                                                next[index] = {
                                                                    ...next[index],
                                                                    product_id: p.id,
                                                                    product_search: p.name,
                                                                };
                                                                return next;
                                                            });
                                                            setActiveProductRow(null);
                                                        }}
                                                    >
                                                        <div className="font-medium">{p.name}</div>
                                                        <div className="text-xs text-muted-foreground">SKU: {p.sku || "N/A"}</div>
                                                    </button>
                                                ))}
                                                {getFilteredProducts(item.product_search).length === 0 && (
                                                    <div className="px-3 py-2 text-xs text-muted-foreground">No products found</div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Qty */}
                                    <div className="md:col-span-1">
                                        <Label className="text-xs">Qty</Label>
                                        <Input
                                            type="number"
                                            min={allowDecimals ? "0.001" : "1"}
                                            step={allowDecimals ? "0.01" : "1"}
                                            value={item.quantity}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                updateEditableItem(
                                                    index,
                                                    "quantity",
                                                    allowDecimals ? (isNaN(val) ? 0 : val) : Math.max(1, parseInt(e.target.value) || 1)
                                                );
                                            }}
                                        />
                                    </div>

                                    {/* Unit Cost */}
                                    <div className="md:col-span-2">
                                        <Label className="text-xs">Unit Cost</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={item.unit_cost}
                                            onChange={(e) =>
                                                updateEditableItem(index, "unit_cost", Math.max(0, parseFloat(e.target.value) || 0))
                                            }
                                        />
                                    </div>

                                    {/* Expiry */}
                                    <div className="md:col-span-2">
                                        <Label className="text-xs">Expiry</Label>
                                        <Input
                                            type="date"
                                            value={item.expiry_date || ""}
                                            onChange={(e) => updateEditableItem(index, "expiry_date", e.target.value || null)}
                                        />
                                    </div>

                                    {/* Line Total (read-only) */}
                                    <div className="md:col-span-1">
                                        <Label className="text-xs">Total</Label>
                                        <div className="h-10 px-3 flex items-center justify-end rounded-md border bg-muted/30 text-sm font-medium">
                                            ${(Number(item.quantity || 0) * Number(item.unit_cost || 0)).toFixed(2)}
                                        </div>
                                    </div>

                                    {/* Remove */}
                                    <div className="md:col-span-1 flex justify-end">
                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeEditableItem(index)}>
                                            <Trash2 className="h-4 w-4 text-red-600" />
                                        </Button>
                                    </div>
                                </div>

                            ))}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={savingEdit}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEditedPurchase} disabled={savingEdit}>
                            {savingEdit ? "Saving..." : "Save Purchase Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
