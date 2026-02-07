'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { ArrowLeft, DollarSign, Package, Calendar, FileText } from "lucide-react";
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

export default function PurchaseDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [purchase, setPurchase] = useState<any>(null);
    const [vendor, setVendor] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');

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
            const productIds: number[] = Array.from(
                new Set((purchaseRes.data.items || []).map((item: any) => item.product_id as number))
            );
            if (productIds.length > 0) {
                const productResponses = await Promise.all(
                    productIds.map((productId) => api.get(`/products/${productId}`))
                );
                setProducts(productResponses.map((res) => res.data));
            } else {
                setProducts([]);
            }
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

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    if (!purchase) return <div className="min-h-screen flex items-center justify-center">Purchase not found</div>;

    const balance = purchase.total_amount - purchase.amount_paid;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
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
                    <Badge 
                        variant="outline" 
                        className={`text-lg px-4 py-2 ${
                            purchase.status === 'paid' ? 'bg-green-100 text-green-700 border-green-200' :
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
                            <DialogContent>
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
        </div>
    );
}
