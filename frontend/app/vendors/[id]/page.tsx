'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { vendorReportsApi } from '@/lib/api';
import { storeConfig, fetchStoreConfig } from '@/lib/store-config';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Edit, CreditCard, ShoppingCart, DollarSign, Filter, FileText } from "lucide-react";
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
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentResult, setPaymentResult] = useState<any>(null);
    const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
    const [receiptData, setReceiptData] = useState<{
        title: string;
        vendorName: string;
        amount: number;
        method?: string;
        date: string;
        balance?: number;
    } | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [storeInfo, setStoreInfo] = useState(storeConfig);
    const [editVendor, setEditVendor] = useState({
        name: '',
        contact_name: '',
        email: '',
        phone: '',
        address: '',
        opening_balance: 0,
    });

    useEffect(() => {
        if (id) {
            fetchData();
        }
        fetchStoreConfig().then(setStoreInfo);
    }, [id]);

    const fetchData = async () => {
        try {
            // Mocked data for now until we have dedicated endpoints or filtering
            const vendorsRes = await api.get('/vendors/');
            const v = vendorsRes.data.find((v: any) => v.id === parseInt(id as string));
            setVendor(v);
            if (v) {
                setEditVendor({
                    name: v.name || '',
                    contact_name: v.contact_name || '',
                    email: v.email || '',
                    phone: v.phone || '',
                    address: v.address || '',
                    opening_balance: v.opening_balance || 0,
                });
            }

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
            setReceiptData({
                title: "Vendor Payment Receipt",
                vendorName: vendor?.name || "Vendor",
                amount: parseFloat(response.data.total_payment || paymentAmount || "0"),
                method: "cash",
                date: new Date().toISOString(),
                balance: response.data?.new_prepaid_credit ?? undefined,
            });
            setReceiptDialogOpen(true);
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
                            <div style="display:flex; justify-content:space-between;"><span>Amount</span><strong>rs ${receiptData.amount.toFixed(2)}</strong></div>
                            ${receiptData.method ? `<div style="display:flex; justify-content:space-between;"><span>Method</span><span>${receiptData.method}</span></div>` : ""}
                            ${typeof receiptData.balance === "number" ? `<div style="display:flex; justify-content:space-between; margin-top:6px;"><span>Prepaid Credit</span><strong>rs ${receiptData.balance.toFixed(2)}</strong></div>` : ""}
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

    const handleVendorReportExport = async () => {
        if (!id) return;
        try {
            const blob = await vendorReportsApi.exportVendorReport(parseInt(id as string));
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `vendor_report_${id}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error("Failed to export vendor report", error);
            alert(error?.response?.data?.detail || "Failed to export report");
        }
    };

    const parseCsv = (text: string) => {
        const rows: string[][] = [];
        let row: string[] = [];
        let current = "";
        let inQuotes = false;

        const pushCell = () => {
            row.push(current);
            current = "";
        };

        const pushRow = () => {
            if (row.length > 0 || current.length > 0) {
                pushCell();
                rows.push(row);
                row = [];
            }
        };

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const next = text[i + 1];

            if (char === '"') {
                if (inQuotes && next === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === ',' && !inQuotes) {
                pushCell();
                continue;
            }

            if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && next === '\n') {
                    i++;
                }
                pushRow();
                continue;
            }

            current += char;
        }

        pushRow();
        return rows.filter((r) => r.length > 0);
    };

    const handleVendorReportPdf = async () => {
        if (!id || !vendor) return;
        try {
            // Fetch the CSV report which includes individual payment transactions
            const response = await api.get(`/vendors/${id}/report`, { responseType: "text" });
            const csvText = response.data as string;
            const rows = parseCsv(csvText);
            
            if (rows.length === 0) {
                alert("No data to export");
                return;
            }

            // Build ledger entries
            interface LedgerEntry {
                date: Date;
                description: string;
                debit: number;
                credit: number;
                balance: number;
            }

            const ledgerEntries: LedgerEntry[] = [];
            const formatCurrency = (amount: number) => `rs ${amount.toFixed(2)}`;
            
            // Opening balance (what we owe vendor from start)
            let runningBalance = vendor.opening_balance || 0;
            
            // Parse CSV rows (skip header row)
            const transactions: Array<{
                date: Date;
                description: string;
                type: string;
                amount: number;
            }> = [];

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.length < 4) continue;
                
                const type = row[0]; // "Purchase" or "Payment"
                const dateStr = row[1];
                const reference = row[2];
                const amountStr = row[3];
                
                if (!dateStr || !amountStr) continue;
                
                const date = new Date(dateStr);
                const amount = parseFloat(amountStr);
                
                if (isNaN(amount) || isNaN(date.getTime())) continue;
                
                transactions.push({
                    date: date,
                    description: reference || type,
                    type: type,
                    amount: amount,
                });
            }

            // Sort by date (oldest first)
            transactions.sort((a, b) => {
                const dateDiff = a.date.getTime() - b.date.getTime();
                if (dateDiff !== 0) return dateDiff;
                // On same date, purchases before payments
                if (a.type === 'Purchase' && b.type === 'Payment') return -1;
                if (a.type === 'Payment' && b.type === 'Purchase') return 1;
                return 0;
            });

            // Calculate running balance and create ledger entries
            transactions.forEach(txn => {
                let debit = 0;
                let credit = 0;

                if (txn.type === 'Purchase') {
                    credit = txn.amount; // We owe more
                    runningBalance += txn.amount;
                } else if (txn.type === 'Payment') {
                    debit = txn.amount; // We pay and reduce what we owe
                    runningBalance -= txn.amount;
                }

                ledgerEntries.push({
                    date: txn.date,
                    description: txn.description,
                    debit: debit,
                    credit: credit,
                    balance: runningBalance,
                });
            });

            // Generate PDF
            const { default: jsPDF } = await import("jspdf");
            const autoTable = (await import("jspdf-autotable")).default;

            const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
            
            // Header
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text(storeInfo.name || "Store", 40, 40);
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            if (storeInfo.address) doc.text(storeInfo.address, 40, 56);
            if (storeInfo.phone) doc.text(storeInfo.phone, 40, 70);
            
            // Title
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('VENDOR LEDGER', doc.internal.pageSize.getWidth() / 2, 100, { align: 'center' });
            
            // Vendor details
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Vendor: ${vendor.name || 'N/A'}`, 40, 120);
            if (vendor.contact_name) doc.text(`Contact: ${vendor.contact_name}`, 40, 134);
            if (vendor.phone) doc.text(`Phone: ${vendor.phone}`, 300, 120);
            doc.text(`Date: ${new Date().toLocaleDateString()}`, 300, 134);
            
            // Opening Balance
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`Opening Balance: ${formatCurrency(vendor.opening_balance || 0)}`, 40, 155);
            
            // Ledger table
            const tableData = ledgerEntries.map(entry => [
                entry.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                entry.description,
                entry.debit > 0 ? formatCurrency(entry.debit) : '-',
                entry.credit > 0 ? formatCurrency(entry.credit) : '-',
                formatCurrency(entry.balance),
            ]);

            autoTable(doc, {
                startY: 170,
                head: [['Date', 'Description', 'Debit (DR)', 'Credit (CR)', 'Balance']],
                body: tableData,
                theme: 'grid',
                styles: { 
                    fontSize: 9,
                    cellPadding: 5,
                },
                headStyles: { 
                    fillColor: [52, 73, 94],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    halign: 'center',
                },
                columnStyles: {
                    0: { cellWidth: 70, halign: 'left' },
                    1: { cellWidth: 220, halign: 'left' },
                    2: { cellWidth: 80, halign: 'right' },
                    3: { cellWidth: 80, halign: 'right' },
                    4: { cellWidth: 85, halign: 'right', fontStyle: 'bold' },
                },
                alternateRowStyles: {
                    fillColor: [245, 245, 245],
                },
                didDrawPage: (data: any) => {
                    // Footer
                    const pageCount = doc.getNumberOfPages();
                    const pageHeight = doc.internal.pageSize.height;
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                    doc.text(
                        `Page ${data.pageNumber} of ${pageCount}`,
                        doc.internal.pageSize.width / 2,
                        pageHeight - 20,
                        { align: 'center' }
                    );
                },
            });

            // Closing Balance Summary
            const finalY = (doc as any).lastAutoTable.finalY || 170;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            
            // Summary box
            doc.setDrawColor(52, 73, 94);
            doc.setLineWidth(1);
            doc.rect(doc.internal.pageSize.getWidth() - 250, finalY + 20, 210, 60);
            
            doc.text('SUMMARY', doc.internal.pageSize.getWidth() - 145, finalY + 38, { align: 'center' });
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debit, 0);
            const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.credit, 0);
            
            doc.text(`Total Debit:`, doc.internal.pageSize.getWidth() - 240, finalY + 52);
            doc.text(formatCurrency(totalDebit), doc.internal.pageSize.getWidth() - 50, finalY + 52, { align: 'right' });
            
            doc.text(`Total Credit:`, doc.internal.pageSize.getWidth() - 240, finalY + 66);
            doc.text(formatCurrency(totalCredit), doc.internal.pageSize.getWidth() - 50, finalY + 66, { align: 'right' });
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(`Outstanding Balance:`, doc.internal.pageSize.getWidth() - 240, finalY + 80);
            doc.setTextColor(runningBalance > 0 ? 220 : 0, runningBalance > 0 ? 53 : 0, runningBalance > 0 ? 69 : 0);
            doc.text(formatCurrency(runningBalance), doc.internal.pageSize.getWidth() - 50, finalY + 80, { align: 'right' });
            doc.setTextColor(0, 0, 0);

            // Generate filename with store name and vendor name
            const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30);
            const storeName = sanitize(storeInfo.name || 'Store');
            const vendorName = sanitize(vendor.name || `Vendor_${vendor.id || id}`);
            const date = new Date().toISOString().split('T')[0];
            
            doc.save(`${storeName}_${vendorName}_Ledger_${date}.pdf`);
        } catch (error: any) {
            console.error("Failed to export vendor report PDF", error);
            alert(error?.response?.data?.detail || "Failed to export PDF");
        }
    };


    const handleUpdateVendor = async () => {
        if (editVendor.opening_balance < 0) {
            alert("Opening balance must be greater than or equal to 0");
            return;
        }
        try {
            await api.put(`/vendors/${id}`, {
                name: editVendor.name,
                contact_name: editVendor.contact_name || null,
                email: editVendor.email || null,
                phone: editVendor.phone || null,
                address: editVendor.address || null,
                opening_balance: editVendor.opening_balance,
            });
            setEditDialogOpen(false);
            await fetchData();
        } catch (error: any) {
            console.error("Failed to update vendor", error);
            alert(error?.response?.data?.detail || "Failed to update vendor");
        }
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
                    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline">
                                <Edit className="mr-2 h-4 w-4" /> Edit Vendor
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Edit Vendor</DialogTitle>
                                <DialogDescription>
                                    Update vendor details and opening balance.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-name">Company Name</Label>
                                    <Input
                                        id="edit-name"
                                        value={editVendor.name}
                                        onChange={(e) => setEditVendor({ ...editVendor, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-contact">Contact Person</Label>
                                    <Input
                                        id="edit-contact"
                                        value={editVendor.contact_name}
                                        onChange={(e) => setEditVendor({ ...editVendor, contact_name: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-email">Email</Label>
                                        <Input
                                            id="edit-email"
                                            type="email"
                                            value={editVendor.email}
                                            onChange={(e) => setEditVendor({ ...editVendor, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-phone">Phone</Label>
                                        <Input
                                            id="edit-phone"
                                            value={editVendor.phone}
                                            onChange={(e) => setEditVendor({ ...editVendor, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-address">Address</Label>
                                    <Input
                                        id="edit-address"
                                        value={editVendor.address}
                                        onChange={(e) => setEditVendor({ ...editVendor, address: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-opening-balance">Opening Balance (Legacy Payable)</Label>
                                    <Input
                                        id="edit-opening-balance"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={editVendor.opening_balance}
                                        onChange={(e) =>
                                            setEditVendor({
                                                ...editVendor,
                                                opening_balance: Math.max(0, parseFloat(e.target.value) || 0),
                                            })
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        This will update the legacy payable purchase.
                                    </p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleUpdateVendor}>Save Changes</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    <Button variant="outline" onClick={handleVendorReportExport}>
                        <FileText className="mr-2 h-4 w-4" /> Make Report (CSV)
                    </Button>
                    <Button variant="outline" onClick={handleVendorReportPdf}>
                        <FileText className="mr-2 h-4 w-4" /> Download PDF
                    </Button>
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
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-medium text-blue-900">Outstanding Balance:</span>
                                                    <span className="text-lg font-bold text-red-600">
                                                        rs {totalBalance.toFixed(2)}
                                                    </span>
                                                </div>
                                                {vendor.prepaid_credit > 0 && (
                                                    <div className="flex justify-between items-center mb-2 text-sm">
                                                        <span className="text-blue-900">Existing Credit:</span>
                                                        <span className="font-bold text-green-600">rs {vendor.prepaid_credit.toFixed(2)}</span>
                                                    </div>
                                                )}
                                                <p className="text-xs text-blue-700">
                                                    ℹ️ This payment will be automatically reconciled against the oldest unpaid purchases first.
                                                </p>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="amount">Payment Amount (Rs)</Label>
                                                <Input
                                                    id="amount"
                                                    type="number"
                                                    step="0.01"
                                                    value={paymentAmount}
                                                    onChange={e => setPaymentAmount(e.target.value)}
                                                    placeholder="0.00"
                                                />
                                                <p className="text-xs text-gray-500">
                                                    💡 Tip: Pay the full balance (rs {totalBalance.toFixed(2)}) or any amount
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
                                                        <span className="font-bold">rs {paymentResult.total_payment.toFixed(2)}</span>
                                                    </div>
                                                    {paymentResult.previous_credit > 0 && (
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Previous Credit Used:</span>
                                                            <span className="font-medium text-blue-600">rs {paymentResult.previous_credit.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Applied to Purchases:</span>
                                                        <span className="font-medium text-green-600">rs {paymentResult.applied_amount.toFixed(2)}</span>
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

                    <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
                        <DialogContent className="sm:max-w-[420px]">
                            <DialogHeader>
                                <DialogTitle>{receiptData?.title || "Receipt"}</DialogTitle>
                                <DialogDescription>
                                    Vendor payment receipt.
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
                                            <span>Amount</span>
                                            <span className="font-semibold">rs {receiptData.amount.toFixed(2)}</span>
                                        </div>
                                        {receiptData.method && (
                                            <div className="flex justify-between">
                                                <span>Method</span>
                                                <span>{receiptData.method}</span>
                                            </div>
                                        )}
                                        {typeof receiptData.balance === "number" && (
                                            <div className="flex justify-between mt-2">
                                                <span>Prepaid Credit</span>
                                                <span className="font-semibold">rs {receiptData.balance.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>
                                    Close
                                </Button>
                                <Button onClick={handlePrintReceipt}>Print Receipt</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
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
