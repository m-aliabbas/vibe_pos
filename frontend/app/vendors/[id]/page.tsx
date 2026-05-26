'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { reportsApi } from '@/lib/api';
import { formatPakistanDate, formatPakistanDateTime, todayPKTDateString } from '@/lib/utils';
import { ToWords } from 'to-words';
import { storeConfig, fetchStoreConfig } from '@/lib/store-config';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Edit, CreditCard, ShoppingCart, DollarSign, Filter, FileText, Printer } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function VendorDetailsPage() {
    const { id } = useParams();
    const router = useRouter();

    // Number to words converter for prices
    const toWords = useMemo(
        () =>
            new ToWords({
                localeCode: 'en-IN',
                converterOptions: {
                    currency: true,
                    ignoreDecimal: false,
                    ignoreZeroCurrency: false,
                    doNotAddOnly: false,
                    currencyOptions: {
                        name: 'Rupee',
                        plural: 'Rupees',
                        symbol: 'Rs',
                        fractionalUnit: {
                            name: 'Paisa',
                            plural: 'Paise',
                            symbol: 'P',
                        },
                    },
                },
            }),
        []
    );

    const convertToWords = useCallback((value: number): string => {
        if (!Number.isFinite(value) || value < 0) return '';
        try {
            return toWords.convert(value);
        } catch {
            return '';
        }
    }, [toWords]);
    const [vendor, setVendor] = useState<any>(null);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentReferenceNote, setPaymentReferenceNote] = useState('');
    const [paymentResult, setPaymentResult] = useState<any>(null);
    const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
    const [receiptData, setReceiptData] = useState<{
        title: string;
        vendorName: string;
        amount: number;
        method?: string;
        date: string;
        balance?: number;
        referenceNote?: string;
    } | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [storeInfo, setStoreInfo] = useState(storeConfig);
    const [ledgerBalance, setLedgerBalance] = useState<number | null>(null);
    const [vendorLedgerEntries, setVendorLedgerEntries] = useState<any[]>([]);
    const [vendorPayments, setVendorPayments] = useState<any[]>([]);
    const [editPaymentEntry, setEditPaymentEntry] = useState<{ id: number; note: string } | null>(null);
    const [editPaymentDialogOpen, setEditPaymentDialogOpen] = useState(false);
    const [editPaymentSaving, setEditPaymentSaving] = useState(false);
    const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);
    const [deletePaymentDialogOpen, setDeletePaymentDialogOpen] = useState(false);
    const [deletingPayment, setDeletingPayment] = useState(false);
    const [activeTab, setActiveTab] = useState('purchases');
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
            // Fetch vendor directly by ID
            const vendorRes = await api.get(`/vendors/${id}`);
            const v = vendorRes.data;
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

            const ledgerRes = await reportsApi.getVendorLedger(parseInt(id as string));
            setLedgerBalance(ledgerRes.closing_balance ?? null);
            setVendorLedgerEntries(ledgerRes.entries || []);

            const paymentsRes = await api.get(`/vendors/${id}/payments`);
            setVendorPayments(paymentsRes.data || []);
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
            const trimmedReferenceNote = paymentReferenceNote.trim();
            const response = await api.post(`/vendors/${id}/payment`, {
                amount: parseFloat(paymentAmount),
                reference_note: trimmedReferenceNote || undefined,
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
                referenceNote: trimmedReferenceNote || undefined,
            });
            setReceiptDialogOpen(true);
            // Refresh purchase data
            fetchData();
        } catch (error: any) {
            console.error("Failed to process payment", error);
            alert(error?.response?.data?.detail || "Failed to process payment");
        }
    };

    const handleSettleBalance = async () => {
        if (!vendor) return;
        const reason = window.prompt("Enter settlement reason (required):", "Balance adjustment");
        if (!reason || !reason.trim()) {
            alert("Settlement reason is required");
            return;
        }

        try {
            const response = await api.post(`/vendors/${id}/settle-balance`, {
                reason: reason.trim(),
            });
            const data = response.data || {};
            alert(
                `Balance settled.\nSettled Payable: Rs ${(data.settled_payable || 0).toFixed(2)}\nSettled Advance: Rs ${(data.settled_advance || 0).toFixed(2)}`
            );
            fetchData();
        } catch (error: any) {
            console.error("Failed to settle balance", error);
            alert(error?.response?.data?.detail || "Failed to settle balance");
        }
    };

    const closePaymentDialog = () => {
        setPaymentDialogOpen(false);
        setPaymentResult(null);
        setPaymentAmount('');
        setPaymentReferenceNote('');
    };

    const handleVendorPaymentEditSave = async () => {
        if (!editPaymentEntry) return;
        setEditPaymentSaving(true);
        try {
            await api.put(`/vendors/${id}/payments/${editPaymentEntry.id}`, {
                amount: 0,
                reference_note: editPaymentEntry.note,
            });
            setEditPaymentDialogOpen(false);
            fetchData();
        } catch (err) {
            console.error("Failed to update vendor payment", err);
        } finally {
            setEditPaymentSaving(false);
        }
    };

    const handleVendorPaymentDelete = async () => {
        if (!deletePaymentId) return;
        setDeletingPayment(true);
        try {
            await api.delete(`/vendors/${id}/payments/${deletePaymentId}`);
            setDeletePaymentDialogOpen(false);
            setDeletePaymentId(null);
            fetchData();
        } catch (err) {
            console.error("Failed to delete vendor payment", err);
        } finally {
            setDeletingPayment(false);
        }
    };

    const handlePrintReceipt = () => {
        if (!receiptData) return;
        const printArea = document.getElementById('payment-receipt-print-area');
        if (!printArea) return;
        const parent = printArea.parentNode as Node;
        const nextSib = printArea.nextSibling;
        document.body.appendChild(printArea);

        // Measure content height in screen px, convert to mm (96dpi: 1px = 0.2646mm)
        const inner = printArea.querySelector('.thermal-receipt') as HTMLElement | null;
        const heightPx = inner ? inner.offsetHeight : printArea.offsetHeight;
        const heightMm = Math.max(80, Math.ceil(heightPx * 0.2646) + 20);

        // Inject explicit page size so WebKit doesn't default to A4
        const pageStyle = document.createElement('style');
        pageStyle.id = 'thermal-receipt-page-style';
        pageStyle.textContent = `@media print { @page { size: 80mm ${heightMm}mm; margin: 2mm; } }`;
        document.head.appendChild(pageStyle);

        document.body.classList.add("print-payment-receipt");
        window.print();
        document.body.classList.remove("print-payment-receipt");

        pageStyle.remove();
        if (nextSib) {
            parent.insertBefore(printArea, nextSib);
        } else {
            parent.appendChild(printArea);
        }
    };

    const handleVendorReportExport = async () => {
        if (!id) return;
        try {
            const blob = await reportsApi.exportVendorLedger(parseInt(id as string));
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `vendor_ledger_${id}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error("Failed to export vendor report", error);
            alert(error?.response?.data?.detail || "Failed to export report");
        }
    };

    const handleVendorReportPdf = async () => {
        if (!id || !vendor) return;
        try {
            const ledger = await reportsApi.getVendorLedger(parseInt(id as string));
            if (!ledger?.entries || ledger.entries.length === 0) {
                alert("No data to export");
                return;
            }

            // Build ledger entries
            interface LedgerEntry {
                date: Date;
                description: string;
                source_type?: string;
                source_id?: number;
                debit: number;
                credit: number;
                balance: number;
            }

            const ledgerEntries: LedgerEntry[] = ledger.entries.map((entry: any) => ({
                date: new Date(entry.date),
                description: entry.description,
                source_type: entry.source_type,
                source_id: entry.source_id,
                debit: Number(entry.debit || 0),
                credit: Number(entry.credit || 0),
                balance: Number(entry.balance || 0),
            }));
            const formatCurrency = (amount: number) => `Rs ${amount.toFixed(2)}`;

            // Extract all purchase IDs from ledger
            const purchaseIds = new Set<number>();
            ledgerEntries.forEach(entry => {
                if (entry.source_type === 'purchase' && entry.source_id) {
                    purchaseIds.add(entry.source_id);
                }
            });

            // Fetch purchase details for all purchases
            const purchasesData = new Map<number, any>();
            const { purchasesApi } = await import("@/lib/api");
            for (const purchaseId of purchaseIds) {
                try {
                    const purchase = await purchasesApi.getPurchase(purchaseId);
                    purchasesData.set(purchaseId, purchase);
                } catch (err) {
                    console.error(`Failed to fetch purchase ${purchaseId}:`, err);
                }
            }

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
            doc.text(`Date: ${todayPKTDateString()}`, 300, 134);
            
            // Opening Balance
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`Opening Balance: ${formatCurrency(Number(ledger.opening_balance || 0))}`, 40, 155);
            
            // Ledger table with inline details
            const tableData = ledgerEntries.map(entry => {
              let description = entry.description;
              
              // Enhance description with inline details
                         if (entry.source_type === 'purchase' && entry.source_id && purchasesData.has(entry.source_id)) {
                             const purchase = purchasesData.get(entry.source_id);
                             const totalAmount = Number(purchase.total_amount || 0);
                             const paidAmount = Number(purchase.amount_paid || 0);
                             const items = purchase.items || [];
                             const dueAmount = Math.max(0, totalAmount - paidAmount);
               
                             if (items.length > 0) {
                                 // Show first 4-5 items with quantities
                                 const displayItems = items.slice(0, 5).map((item: any) => {
                                     const qty = item.quantity > 1 ? ` (${item.quantity})` : '';
                                     const itemName = item.product_name || item.product?.name || item.description || `Product #${item.product_id}`;
                                     return `${itemName}${qty}`;
                                 }).join(', ');
                 
                                 const moreCount = Math.max(0, items.length - 5);
                                 const moreText = moreCount > 0 ? ` +${moreCount} more` : '';
                                 description = `Purchase #${entry.source_id}: ${displayItems}${moreText} | Total ${formatCurrency(totalAmount)}, Paid ${formatCurrency(paidAmount)}, Due ${formatCurrency(dueAmount)}`;
                             } else {
                                 description = `Purchase #${entry.source_id} | Total ${formatCurrency(totalAmount)}, Paid ${formatCurrency(paidAmount)}, Due ${formatCurrency(dueAmount)}`;
                             }
                         } else if (entry.source_type === 'vendor_payment' || entry.source_type === 'purchase_payment') {
                             description = 'Payment made';
                         } else if (entry.source_type === 'vendor_advance') {
                             // Preserve backend description/notes for vendor advances
                             description = entry.description || 'Vendor advance';
                         }
              
              return [
                formatPakistanDate(entry.date),
                description,
                entry.debit > 0 ? formatCurrency(entry.debit) : '-',
                entry.credit > 0 ? formatCurrency(entry.credit) : '-',
                formatCurrency(entry.balance),
              ];
            });

            autoTable(doc, {
              startY: 170,
              head: [['Date', 'Description', 'Debit (DR)', 'Credit (CR)', 'Balance']],
              body: tableData,
              theme: 'grid',
              styles: { 
                  fontSize: 8,
                  cellPadding: 4,
              },
              headStyles: { 
                  fillColor: [52, 73, 94],
                  textColor: [255, 255, 255],
                  fontStyle: 'bold',
                  halign: 'center',
              },
              columnStyles: {
                  0: { cellWidth: 65, halign: 'left' },
                  1: { cellWidth: 240, halign: 'left' },
                  2: { cellWidth: 75, halign: 'right' },
                  3: { cellWidth: 75, halign: 'right' },
                  4: { cellWidth: 80, halign: 'right', fontStyle: 'bold' },
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
            const closingBalance = Number(ledger.closing_balance || 0);
            doc.setTextColor(closingBalance > 0 ? 220 : 0, closingBalance > 0 ? 53 : 0, closingBalance > 0 ? 69 : 0);
            doc.text(formatCurrency(closingBalance), doc.internal.pageSize.getWidth() - 50, finalY + 80, { align: 'right' });
            doc.setTextColor(0, 0, 0);

            // Generate filename with store name and vendor name
            const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30);
            const storeName = sanitize(storeInfo.name || 'Store');
            const vendorName = sanitize(vendor.name || `Vendor_${vendor.id || id}`);
            const date = todayPKTDateString();
            
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

    const purchaseBalance = calculateBalance(purchases);
    const totalBalance = ledgerBalance !== null ? Math.max(0, ledgerBalance) : purchaseBalance;
    const ledgerAdvance = ledgerBalance !== null ? Math.max(0, -ledgerBalance) : 0;
    const effectivePrepaidCredit = Math.max(vendor.prepaid_credit || 0, ledgerAdvance);

    // Merge purchases with return/adjustment ledger rows for a unified vendor history.
    const returnLikeSourceTypes = new Set(['vendor_settlement', 'vendor_return', 'purchase_return', 'return']);

    const historyRows = [
        ...purchases.map((purchase) => ({
            kind: 'purchase' as const,
            id: `purchase-${purchase.id}`,
            date: purchase.created_at,
            reference: `#${purchase.id}`,
            status: purchase.status,
            total_amount: Number(purchase.total_amount || 0),
            amount_paid: Number(purchase.amount_paid || 0),
            balance: Number((purchase.total_amount || 0) - (purchase.amount_paid || 0)),
        })),
        ...vendorLedgerEntries
            .filter((entry: any) => returnLikeSourceTypes.has(entry.source_type))
            .map((entry: any, idx: number) => ({
                kind: 'return' as const,
                id: `ledger-${entry.source_type || 'entry'}-${entry.source_id || idx}-${entry.date || idx}`,
                date: entry.date,
                reference: entry.source_id ? `#${entry.source_id}` : '-',
                status: entry.source_type || 'adjustment',
                total_amount: Number(entry.credit || 0),
                amount_paid: Number(entry.debit || 0),
                balance: Number((entry.credit || 0) - (entry.debit || 0)),
                description: entry.description || 'Adjustment',
            })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Filter history rows based on selected filter
    const filteredHistory = historyRows.filter((row) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'returns') return row.kind === 'return';
        return row.kind === 'purchase' && row.status === statusFilter;
    });

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
                                    {editVendor.opening_balance > 0 && (
                                        <p className="text-xs text-blue-600 font-medium">
                                            {convertToWords(editVendor.opening_balance)}
                                        </p>
                                    )}
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
                    {(totalBalance > 0 || effectivePrepaidCredit > 0) && (
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
                                        Enter payment amount. It will be recorded at vendor-ledger level without auto-distributing across purchases.
                                    </DialogDescription>
                                </DialogHeader>
                                {!paymentResult ? (
                                    <>
                                        <div className="grid gap-4 py-4">
                                            <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-medium text-blue-900">Outstanding Balance:</span>
                                                    <span className="text-lg font-bold text-red-600">
                                                        Rs {totalBalance.toFixed(2)}
                                                    </span>
                                                </div>
                                                {effectivePrepaidCredit > 0 && (
                                                    <div className="flex justify-between items-center mb-2 text-sm">
                                                        <span className="text-blue-900">Existing Credit:</span>
                                                        <span className="font-bold text-green-600">Rs {effectivePrepaidCredit.toFixed(2)}</span>
                                                    </div>
                                                )}
                                                <p className="text-xs text-blue-700">
                                                    ℹ️ This payment is recorded at vendor level (ledger) to avoid ambiguous auto-distribution across purchases.
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
                                                {paymentAmount && parseFloat(paymentAmount) > 0 && (
                                                    <p className="text-xs text-blue-600 font-medium">
                                                        {convertToWords(parseFloat(paymentAmount))}
                                                    </p>
                                                )}
                                                <p className="text-xs text-gray-500">
                                                    💡 Tip: Pay the full balance (Rs {totalBalance.toFixed(2)}) or any amount
                                                </p>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="payment-reference-note">Reference Note (Optional)</Label>
                                                <Input
                                                    id="payment-reference-note"
                                                    value={paymentReferenceNote}
                                                    onChange={e => setPaymentReferenceNote(e.target.value)}
                                                    placeholder="e.g. cheque #, bank txn id, memo"
                                                />
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
                                                <div className="space-y-3 text-sm">
                                                    <div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Payment Amount:</span>
                                                            <span className="font-bold">Rs {paymentResult.total_payment.toFixed(2)}</span>
                                                        </div>
                                                        {paymentResult.total_payment > 0 && (
                                                            <p className="text-xs text-blue-600 font-medium mt-1">
                                                                {convertToWords(paymentResult.total_payment)}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {paymentResult.prepaid_used > 0 && (
                                                        <div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-600">Previous Credit Used:</span>
                                                                <span className="font-medium text-blue-600">Rs {paymentResult.prepaid_used.toFixed(2)}</span>
                                                            </div>
                                                            <p className="text-xs text-blue-600 font-medium mt-1">
                                                                {convertToWords(paymentResult.prepaid_used)}
                                                            </p>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Applied to Payable (Ledger):</span>
                                                            <span className="font-medium text-green-600">Rs {paymentResult.applied_amount.toFixed(2)}</span>
                                                        </div>
                                                        {paymentResult.applied_amount > 0 && (
                                                            <p className="text-xs text-blue-600 font-medium mt-1">
                                                                {convertToWords(paymentResult.applied_amount)}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {paymentResult.new_prepaid_credit > 0 && (
                                                        <div className="border-t pt-2 mt-2">
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-600">New Prepaid Credit:</span>
                                                                <span className="font-bold text-blue-600">Rs {paymentResult.new_prepaid_credit.toFixed(2)}</span>
                                                            </div>
                                                            <p className="text-xs text-blue-600 font-medium mt-1">
                                                                {convertToWords(paymentResult.new_prepaid_credit)}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                                {paymentResult.new_prepaid_credit > 0 && (
                                                    <p className="text-xs text-blue-700 mt-2 bg-blue-100 p-2 rounded">
                                                        💡 Prepaid credit is kept at vendor ledger level and can be applied manually when needed.
                                                    </p>
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-sm mb-2">Purchase Allocation:</h4>
                                                {paymentResult.updated_purchases && paymentResult.updated_purchases.length > 0 ? (
                                                    <div className="space-y-2">
                                                        {paymentResult.updated_purchases.map((up: any) => (
                                                            <div key={up.purchase_id} className="bg-gray-50 p-3 rounded-md text-sm border">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="font-mono text-xs">Purchase #{up.purchase_id}</span>
                                                                    <span className="text-green-600 font-medium">-Rs {up.payment_applied.toFixed(2)}</span>
                                                                </div>
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    New Balance: Rs {up.new_balance.toFixed(2)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                                                        No automatic purchase allocation performed for this payment.
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
                    {(totalBalance > 0 || effectivePrepaidCredit > 0) && (
                        <Button variant="secondary" onClick={handleSettleBalance}>
                            Clear Balance to 0
                        </Button>
                    )}

                    <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
                        <DialogContent className="sm:max-w-[340px] p-0">
                            <div className="no-print p-4 border-b flex justify-between items-center">
                                <h2 className="font-semibold text-base">{receiptData?.title || "Receipt"}</h2>
                                <Button size="sm" onClick={handlePrintReceipt}>
                                    <Printer className="h-4 w-4 mr-1" />
                                    Print
                                </Button>
                            </div>

                            {receiptData && (
                                <div id="payment-receipt-print-area" className="p-4 flex justify-center">
                                    <div className="thermal-receipt bg-white w-full max-w-[80mm] mx-auto">
                                        <div className="text-sm">
                                            {/* Store Header */}
                                            <div className="text-center border-b-2 border-dashed border-gray-400 pb-3 mb-3">
                                                <h1 className="text-xl font-bold text-gray-900 mb-1">{storeInfo.name}</h1>
                                                {storeInfo.address && <p className="text-xs text-gray-600">{storeInfo.address}</p>}
                                                {storeInfo.city && <p className="text-xs text-gray-600">{storeInfo.city}</p>}
                                                {storeInfo.phone && <p className="text-xs text-gray-600">{storeInfo.phone}</p>}
                                                {storeInfo.email && <p className="text-xs text-gray-600">{storeInfo.email}</p>}
                                            </div>

                                            {/* Receipt Title */}
                                            <div className="text-center mb-3 pb-3 border-b border-dashed border-gray-300">
                                                <h2 className="text-lg font-bold text-gray-900 mb-1">PAYMENT RECEIPT</h2>
                                                <p className="text-xs text-gray-600">{formatPakistanDateTime(receiptData.date)}</p>
                                            </div>

                                            {/* Vendor Info */}
                                            <div className="mb-3 pb-3 border-b border-dashed border-gray-300">
                                                <p className="text-xs font-semibold text-gray-600 mb-1">VENDOR:</p>
                                                <p className="text-sm font-medium text-gray-900">{receiptData.vendorName}</p>
                                            </div>

                                            {/* Payment Details */}
                                            <div className="mb-3 pb-3 border-b-2 border-dashed border-gray-400">
                                                <p className="text-xs font-semibold text-gray-600 mb-2">PAYMENT DETAILS:</p>
                                                <div className="flex justify-between text-base font-bold pt-1 border-t-2 border-gray-900">
                                                    <span className="text-gray-900">AMOUNT PAID:</span>
                                                    <span className="text-gray-900">Rs {receiptData.amount.toFixed(2)}</span>
                                                </div>
                                                {receiptData.method && (
                                                    <div className="flex justify-between text-sm mt-1">
                                                        <span className="text-gray-600">Method:</span>
                                                        <span className="font-medium text-gray-900 capitalize">{receiptData.method}</span>
                                                    </div>
                                                )}
                                                {receiptData.referenceNote && (
                                                    <div className="text-sm mt-2">
                                                        <span className="text-gray-600">Reference: </span>
                                                        <span className="font-medium text-gray-900">{receiptData.referenceNote}</span>
                                                    </div>
                                                )}
                                                {typeof receiptData.balance === "number" && (
                                                    <div className="flex justify-between text-sm mt-2 pt-2 border-t border-dashed border-gray-300">
                                                        <span className="text-gray-600">Prepaid Credit:</span>
                                                        <span className="font-semibold text-green-700">Rs {receiptData.balance.toFixed(2)}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Footer */}
                                            <div className="text-center pt-2">
                                                <p className="text-xs text-gray-600">Thank you!</p>
                                                {storeInfo.website && <p className="text-xs text-gray-400 mt-1">{storeInfo.website}</p>}
                                                <p className="text-xs text-gray-400 mt-1">VibePOS (by vibeexe.com)</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="no-print p-3 border-t flex justify-end">
                                <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>Close</Button>
                            </div>
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
                        <div className="text-2xl font-bold text-green-600">Rs {calculateTotalPaid(purchases).toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card className={totalBalance > 0 ? "border-red-200 bg-red-50" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Outstanding Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${totalBalance > 0 ? "text-red-600" : "text-gray-900"}`}>
                            Rs {totalBalance.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {effectivePrepaidCredit > 0 && (
                <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="flex items-center justify-between p-6">
                        <div>
                            <h3 className="font-semibold text-blue-900">💰 Prepaid Credit Available</h3>
                            <p className="text-sm text-blue-700">
                                This vendor has a prepaid balance of <span className="font-bold">Rs {effectivePrepaidCredit.toFixed(2)}</span> tracked at ledger level.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-4">
                <Tabs value={activeTab} defaultValue="purchases" onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="purchases">Purchase History</TabsTrigger>
                        <TabsTrigger value="payments">Payment History ({vendorPayments.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="purchases">
                        <div className="flex justify-between items-center mb-3">
                            <span />
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
                                    <SelectItem value="returns">Returns / Adjustments</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50/50">
                                        <TableHead>Date</TableHead>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Total Amount</TableHead>
                                        <TableHead className="text-right">Paid</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredHistory.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            className={row.kind === 'purchase' ? "cursor-pointer hover:bg-gray-50 transition-colors" : "bg-slate-50/40"}
                                            onClick={() => {
                                                if (row.kind === 'purchase') {
                                                    router.push(`/purchases/${row.reference.replace('#', '')}`);
                                                }
                                            }}
                                        >
                                            <TableCell>
                                                {formatPakistanDate(row.date)}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    row.kind === 'return'
                                                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                                                        : row.status === 'paid'
                                                            ? 'bg-green-100 text-green-700 border-green-200'
                                                            : row.status === 'partial'
                                                                ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                                                : 'bg-red-100 text-red-700 border-red-200'
                                                }>
                                                    {row.kind === 'return' ? 'RETURN / ADJ' : String(row.status || '').toUpperCase()}
                                                </Badge>
                                                {row.kind === 'return' && row.description && (
                                                    <p className="text-xs text-gray-500 mt-1 max-w-[260px] truncate" title={row.description}>{row.description}</p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                Rs {row.total_amount.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right text-gray-500">
                                                Rs {row.amount_paid.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                Rs {row.balance.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="payments">
                        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                            {vendorPayments.length === 0 ? (
                                <p className="text-center py-8 text-muted-foreground">No payment history yet.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50/50">
                                            <TableHead>Date</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead>Note</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {vendorPayments.map((p: any) => (
                                            <TableRow key={p.id}>
                                                <TableCell>{p.date ? formatPakistanDate(p.date) : '-'}</TableCell>
                                                <TableCell className="font-medium text-green-600">Rs {(p.amount as number).toFixed(2)}</TableCell>
                                                <TableCell>{p.reference_note || '-'}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                setEditPaymentEntry({ id: p.id, note: p.reference_note || '' });
                                                                setEditPaymentDialogOpen(true);
                                                            }}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive hover:text-destructive"
                                                            onClick={() => {
                                                                setDeletePaymentId(p.id);
                                                                setDeletePaymentDialogOpen(true);
                                                            }}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Edit Vendor Payment Note Dialog */}
            <Dialog open={editPaymentDialogOpen} onOpenChange={setEditPaymentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Payment Note</DialogTitle>
                    </DialogHeader>
                    {editPaymentEntry && (
                        <div className="space-y-4">
                            <div>
                                <Label>Reference Note</Label>
                                <Input
                                    value={editPaymentEntry.note}
                                    onChange={(e) => setEditPaymentEntry({ ...editPaymentEntry, note: e.target.value })}
                                    placeholder="Optional note"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setEditPaymentDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleVendorPaymentEditSave} disabled={editPaymentSaving}>
                                    {editPaymentSaving ? 'Saving...' : 'Save'}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Vendor Payment Confirm Dialog */}
            <Dialog open={deletePaymentDialogOpen} onOpenChange={setDeletePaymentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Payment</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">Are you sure you want to delete this payment? The vendor ledger balance will be recalculated.</p>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setDeletePaymentDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleVendorPaymentDelete} disabled={deletingPayment}>
                            {deletingPayment ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
