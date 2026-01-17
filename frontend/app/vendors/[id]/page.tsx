'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Edit, CreditCard, ShoppingCart, DollarSign, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

export default function VendorDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const [vendor, setVendor] = useState<any>(null);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentResult, setPaymentResult] = useState<any>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        if (id) {
            fetchData();
        }
    }, [id]);

    const fetchData = async () => {
        try {
            // Mocked data for now until we have dedicated endpoints or filtering
            const vendorsRes = await api.get('/vendors/');
            const v = vendorsRes.data.find((v: any) => v.id === parseInt(id as string));
            setVendor(v);

            const purchasesRes = await api.get(`/purchases/vendor/${id}`);
            setPurchases(purchasesRes.data);
        } catch (error) {
            console.error("Failed to fetch details", error);
        } finally {
            setLoading(false);
        }
    };

    const calculateBalance = (purchases: any[]) => {
        return purchases.reduce((acc, p) => acc + (p.total_amount - p.amount_paid), 0);
    };

    const calculateTotalPaid = (purchases: any[]) => {
        return purchases.reduce((acc, p) => acc + p.amount_paid, 0);
    };

    const handleVendorPayment = async () => {
        try {
            const response = await api.post(`/vendors/${id}/payment`, {
                amount: parseFloat(paymentAmount)
            });
            setPaymentResult(response.data);
            setPaymentAmount('');
            // Refresh purchase data
            fetchData();
        } catch (error: any) {
            console.error("Failed to process payment", error);
            alert(error?.response?.data?.detail || "Failed to process payment");
        }
    };

    const closePaymentDialog = () => {
        setPaymentDialogOpen(false);
        setPaymentResult(null);
        setPaymentAmount('');
    };

    if (loading) return <div>Loading...</div>;
    if (!vendor) return <div>Vendor not found</div>;

    const totalBalance = calculateBalance(purchases);
    
    // Filter purchases based on status
    const filteredPurchases = statusFilter === 'all' 
        ? purchases 
        : purchases.filter(p => p.status === statusFilter);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Vendors
            </Button>

            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{vendor.name}</h1>
                    <div className="flex items-center gap-4 text-gray-500 mt-2">
                        <span>{vendor.contact_name}</span>
                        <span>•</span>
                        <span>{vendor.email}</span>
                        <span>•</span>
                        <span>{vendor.phone}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{vendor.address}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push(`/inventory/purchase?vendorId=${vendor.id}`)}>
                        <ShoppingCart className="mr-2 h-4 w-4" /> New Purchase
                    </Button>
                    {(totalBalance > 0 || vendor.prepaid_credit > 0) && (
                        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-green-600 hover:bg-green-700">
                                    <DollarSign className="mr-2 h-4 w-4" /> Make Payment
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Make Payment to {vendor.name}</DialogTitle>
                                    <DialogDescription>
                                        Enter payment amount. It will be automatically distributed across unpaid purchases (oldest first).
                                    </DialogDescription>
                                </DialogHeader>
                                {!paymentResult ? (
                                    <>
                                        <div className="grid gap-4 py-4">
                                            <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                                                <div className="space-y-1 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Outstanding Balance:</span>
                                                        <span className="font-bold text-red-600">${totalBalance.toFixed(2)}</span>
                                                    </div>
                                                    {vendor.prepaid_credit > 0 && (
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Existing Credit:</span>
                                                            <span className="font-bold text-blue-600">${vendor.prepaid_credit.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Unpaid Purchases:</span>
                                                        <span className="font-medium">{purchases.filter(p => p.status !== 'paid').length}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="amount">Payment Amount ($)</Label>
                                                <Input 
                                                    id="amount" 
                                                    type="number" 
                                                    step="0.01" 
                                                    value={paymentAmount}
                                                    onChange={e => setPaymentAmount(e.target.value)}
                                                    placeholder="0.00"
                                                />
                                                <p className="text-xs text-gray-500">
                                                    💡 Tip: Pay the full balance (${totalBalance.toFixed(2)}) or any amount
                                                </p>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={closePaymentDialog}>
                                                Cancel
                                            </Button>
                                            <Button onClick={handleVendorPayment} disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}>
                                                Process Payment
                                            </Button>
                                        </DialogFooter>
                                    </>
                                ) : (
                                    <>
                                        <div className="py-4 space-y-4">
                                            <div className="bg-green-50 p-4 rounded-md border border-green-200">
                                                <h3 className="font-semibold text-green-900 mb-2">✅ Payment Processed Successfully</h3>
                                                <div className="space-y-1 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Payment Amount:</span>
                                                        <span className="font-bold">${paymentResult.total_payment.toFixed(2)}</span>
                                                    </div>
                                                    {paymentResult.previous_credit > 0 && (
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Previous Credit Used:</span>
                                                            <span className="font-medium text-blue-600">${paymentResult.previous_credit.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Applied to Purchases:</span>
                                                        <span className="font-medium text-green-600">${paymentResult.applied_amount.toFixed(2)}</span>
                                                    </div>
                                                    {paymentResult.new_prepaid_credit > 0 && (
                                                        <div className="flex justify-between border-t pt-1 mt-1">
                                                            <span className="text-gray-600">New Prepaid Credit:</span>
                                                            <span className="font-bold text-blue-600">${paymentResult.new_prepaid_credit.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {paymentResult.new_prepaid_credit > 0 && (
                                                    <p className="text-xs text-blue-700 mt-2 bg-blue-100 p-2 rounded">
                                                        💡 The prepaid credit will be automatically applied to future purchases.
                                                    </p>
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-sm mb-2">Updated Purchases:</h4>
                                                {paymentResult.updated_purchases && paymentResult.updated_purchases.length > 0 ? (
                                                    <div className="space-y-2">
                                                        {paymentResult.updated_purchases.map((up: any) => (
                                                            <div key={up.purchase_id} className="bg-gray-50 p-3 rounded-md text-sm border">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="font-mono text-xs">Purchase #{up.purchase_id}</span>
                                                                    <span className="text-green-600 font-medium">-${up.payment_applied.toFixed(2)}</span>
                                                                </div>
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    New Balance: ${up.new_balance.toFixed(2)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                                                        No outstanding purchases. Amount stored as prepaid credit.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button onClick={closePaymentDialog}>
                                                Close
                                            </Button>
                                        </DialogFooter>
                                    </>
                                )}
                            </DialogContent>
                        </Dialog>
                    )}
                    <Button variant="destructive" disabled title="Delete disabled for safety">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Total Purchases</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{purchases.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Total Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">${calculateTotalPaid(purchases).toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card className={totalBalance > 0 ? "border-red-200 bg-red-50" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Outstanding Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${totalBalance > 0 ? "text-red-600" : "text-gray-900"}`}>
                            ${totalBalance.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {vendor.prepaid_credit > 0 && (
                <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="flex items-center justify-between p-6">
                        <div>
                            <h3 className="font-semibold text-blue-900">💰 Prepaid Credit Available</h3>
                            <p className="text-sm text-blue-700">
                                This vendor has a prepaid balance of <span className="font-bold">${vendor.prepaid_credit.toFixed(2)}</span> that will be automatically applied to future purchases.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Purchase History</h2>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-48">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Filter by Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                            <SelectItem value="unpaid">Unpaid</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50">
                                <TableHead>Date</TableHead>
                                <TableHead>Purchase ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPurchases.map((purchase) => (
                                <TableRow 
                                    key={purchase.id}
                                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => router.push(`/purchases/${purchase.id}`)}
                                >
                                    <TableCell>
                                        {new Date(purchase.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">#{purchase.id}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            purchase.status === 'paid' ? 'bg-green-100 text-green-700 border-green-200' :
                                                purchase.status === 'partial' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                                    'bg-red-100 text-red-700 border-red-200'
                                        }>
                                            {purchase.status.toUpperCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        ${purchase.total_amount.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right text-gray-500">
                                        ${purchase.amount_paid.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        ${(purchase.total_amount - purchase.amount_paid).toFixed(2)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
