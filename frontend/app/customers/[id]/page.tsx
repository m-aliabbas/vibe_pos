"use client";

import { useState, useEffect, use, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { ToWords } from "to-words";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api, { customerApi, CustomerResponse, CustomerNote, CustomerPayment } from "@/lib/api";
import { storeConfig, fetchStoreConfig } from "@/lib/store-config";
import { formatPakistanDate, formatPakistanDateTime, todayPKTDateString } from "@/lib/utils";
import {
  User,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Calendar,
  ShoppingBag,
  CreditCard,
  Plus,
  Edit,
  Trash2,
  ArrowLeft,
  Receipt,
  MessageSquare,
  TrendingUp,
  FileText,
  Printer,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CreditLimitAlert, parseCreditLimitError } from "@/components/CreditLimitAlert";

export default function CustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap params Promise using React.use()
  const unwrappedParams = use(params);
  
  const router = useRouter();
  const { token, isLoading } = useAuthStore();

  // Number to words converter for prices
  const toWords = useMemo(
    () =>
      new ToWords({
        localeCode: "en-IN",
        converterOptions: {
          currency: true,
          ignoreDecimal: false,
          ignoreZeroCurrency: false,
          doNotAddOnly: false,
          currencyOptions: {
            name: "Rupee",
            plural: "Rupees",
            symbol: "Rs",
            fractionalUnit: {
              name: "Paisa",
              plural: "Paise",
              symbol: "P",
            },
          },
        },
      }),
    []
  );

  const convertToWords = useCallback((value: number): string => {
    if (!Number.isFinite(value) || value < 0) return "";
    try {
      return toWords.convert(value);
    } catch {
      return "";
    }
  }, [toWords]);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [financialSummary, setFinancialSummary] = useState<any>(null);

  // Dialog states
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false);
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState(todayPKTDateString());
  const [deleteNoteId, setDeleteNoteId] = useState<number | null>(null);
  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState(false);
  const [creditLimitAlert, setCreditLimitAlert] = useState<{
    limit: number; current: number; available: number; attempted?: number;
  } | null>(null);

  // Form states
  const [newNote, setNewNote] = useState({ note_type: "general", note_text: "" });
  const [newPayment, setNewPayment] = useState({ amount: 0, payment_method: "cash", reference_note: "" });
  const [newAdvance, setNewAdvance] = useState({ amount: 0, description: "", payment_method: "cash" });
  const [editCustomer, setEditCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    opening_balance: 0,
    credit_limit: undefined as number | null | undefined,
  });

  const [receiptData, setReceiptData] = useState<{
    type: "payment" | "advance";
    title: string;
    customerName: string;
    customerPhone?: string;
    amount: number;
    method?: string;
    reference?: string;
    date: string;
    balance?: number;
  } | null>(null);
  const [storeInfo, setStoreInfo] = useState(storeConfig);

  // Parse customerId with validation
  const customerId = parseInt(unwrappedParams.id);
  const isValidId = !isNaN(customerId) && customerId > 0;

  useEffect(() => {
    if (isLoading) return;

    if (!token) {
      router.push("/login");
      return;
    }

    // Validate customer ID before fetching data
    if (!isValidId) {
      console.error("Invalid customer ID:", unwrappedParams.id);
      router.push("/customers");
      return;
    }

    fetchCustomerData();
  }, [token, isLoading, unwrappedParams.id]);

  useEffect(() => {
    fetchStoreConfig().then(setStoreInfo);
  }, []);

  const fetchCustomerData = async () => {
    // Double check customerId is valid
    if (!isValidId) {
      router.push("/customers");
      return;
    }

    try {
      setLoading(true);
      const [customerData, summaryData] = await Promise.all([
        customerApi.getCustomer(customerId),
        customerApi.getCustomerFinancialSummary(customerId),
      ]);
      
      // DEBUG: Log the customer data to see what's being returned
      console.log('=== CUSTOMER DATA FROM API ===');
      console.log('Customer:', customerData);
      console.log('Notes array:', customerData.notes);
      console.log('Notes count:', customerData.notes?.length || 0);
      console.log('Payments array:', customerData.payments);
      console.log('Payments count:', customerData.payments?.length || 0);
      
      setCustomer(customerData);
      setFinancialSummary(summaryData);
      setEditCustomer({
        name: customerData.name || "",
        phone: customerData.phone || "",
        email: customerData.email || "",
        address: customerData.address || "",
        opening_balance: customerData.opening_balance || 0,
        credit_limit: customerData.credit_limit ?? undefined,
      });
    } catch (error) {
      console.error("Failed to fetch customer:", error);
      router.push("/customers");
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.note_text.trim() || !isValidId) return;

    try {
      await customerApi.addCustomerNote(customerId, newNote);
      setNoteDialogOpen(false);
      setNewNote({ note_type: "general", note_text: "" });
      fetchCustomerData();
    } catch (error) {
      console.error("Failed to add note:", error);
      alert("Failed to add note");
    }
  };

  const handleRecordPayment = async () => {
    if (newPayment.amount <= 0) {
      alert("Payment amount must be greater than 0");
      return;
    }

    if (!isValidId) return;

    try {
      const payment = await customerApi.recordCustomerPayment(customerId, newPayment);
      const updatedCustomer = await customerApi.getCustomer(customerId);
      setPaymentDialogOpen(false);
      setNewPayment({ amount: 0, payment_method: "cash", reference_note: "" });
      setReceiptData({
        type: "payment",
        title: "Payment Receipt",
        customerName: updatedCustomer.name || "Customer",
        customerPhone: updatedCustomer.phone || undefined,
        amount: payment.amount,
        method: payment.payment_method,
        reference: payment.reference_note || undefined,
        date: payment.payment_date || payment.created_at,
        balance: updatedCustomer.outstanding_balance,
      });
      setReceiptDialogOpen(true);
      fetchCustomerData();
    } catch (error) {
      console.error("Failed to record payment:", error);
      alert("Failed to record payment");
    }
  };

  const handleCustomerReportExport = async () => {
    if (!customer) return;
    try {
      const blob = await customerApi.exportCustomerReport(customer.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customer_report_${customer.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Failed to export customer report", error);
      alert(error?.response?.data?.detail || "Failed to export report");
    }
  };

  const handleAddAdvance = async () => {
    if (newAdvance.amount <= 0) {
      alert("Amount must be greater than 0");
      return;
    }

    if (!newAdvance.description.trim()) {
      alert("Please add a description");
      return;
    }

    if (!isValidId) return;

    try {
      const advanceResponse = await customerApi.addCustomerAdvance(customerId, newAdvance);
      const updatedCustomer = await customerApi.getCustomer(customerId);
      setAdvanceDialogOpen(false);
      setNewAdvance({ amount: 0, description: "", payment_method: "cash" });
      setReceiptData({
        type: "advance",
        title: "Advance Payment Receipt",
        customerName: updatedCustomer.name || "Customer",
        customerPhone: updatedCustomer.phone || undefined,
        amount: advanceResponse.amount,
        method: advanceResponse.payment_method || "cash",
        reference: advanceResponse.description || undefined,
        date: new Date().toISOString(),
        balance: advanceResponse.new_balance ?? updatedCustomer.outstanding_balance,
      });
      setReceiptDialogOpen(true);
      fetchCustomerData();
    } catch (error: any) {
      console.error("Failed to add advance:", error);
      const detail: string = error.response?.data?.detail || "";
      const creditInfo = parseCreditLimitError(detail);
      if (creditInfo) {
        setCreditLimitAlert({ ...creditInfo, attempted: newAdvance.amount });
      } else {
        alert(detail || "Failed to add advance payment");
      }
    }
  };

  const handleUpdateCustomer = async () => {
    if (!isValidId) return;
    if (editCustomer.opening_balance < 0) {
      alert("Opening balance must be greater than or equal to 0");
      return;
    }
    
    try {
      await customerApi.updateCustomer(customerId, editCustomer);
      setEditDialogOpen(false);
      fetchCustomerData();
    } catch (error) {
      console.error("Failed to update customer:", error);
      alert("Failed to update customer");
    }
  };

  const handleSendReminder = async () => {
    if (!customer) return;
    try {
      await customerApi.sendCustomerReminder(customer.id);
      alert("Reminder sent successfully");
    } catch (error: any) {
      console.error("Failed to send reminder", error);
      alert(error?.response?.data?.detail || "Failed to send reminder");
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

  const handleCustomerReportPdf = async (startDate?: string, endDate?: string) => {
    if (!isValidId || !customer) return;
    try {
      const ledgerReport = await customerApi.getCustomerLedger(customerId, {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });

      interface LedgerEntry {
        date: Date;
        description: string;
        source_type?: string;
        source_id?: number;
        debit: number;
        credit: number;
        balance: number;
      }

      const ledgerEntries: LedgerEntry[] = ledgerReport.entries.map((entry) => ({
        date: new Date(entry.date),
        description: entry.description,
        source_type: entry.source_type,
        source_id: entry.source_id,
        debit: entry.debit,
        credit: entry.credit,
        balance: entry.balance,
      }));

      // Extract all sale IDs from ledger
      const saleIds = new Set<number>();
      ledgerEntries.forEach(entry => {
        if (entry.source_type === 'sale' && entry.source_id) {
          saleIds.add(entry.source_id);
        }
      });

      // Fetch sale details for all sales
      const salesData = new Map<number, any>();
      const { salesApi } = await import("@/lib/api");
      for (const saleId of saleIds) {
        try {
          const sale = await salesApi.getSale(saleId);
          salesData.set(saleId, sale);
        } catch (err) {
          console.error(`Failed to fetch sale ${saleId}:`, err);
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
      doc.text('CUSTOMER LEDGER', doc.internal.pageSize.getWidth() / 2, 100, { align: 'center' });
      
      // Customer details
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Customer: ${customer.name || 'N/A'}`, 40, 120);
      doc.text(`ID: ${customer.customer_id || 'N/A'}`, 40, 134);
      if (customer.phone) doc.text(`Phone: ${customer.phone}`, 300, 120);
      doc.text(`Date: ${todayPKTDateString()}`, 300, 134);
      
      // Opening Balance
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Opening Balance: ${formatCurrency(ledgerReport.opening_balance || 0)}`, 40, 155);
      
      // Ledger table with inline details
      const tableData = ledgerEntries.map(entry => {
        let description = entry.description;
        
        // Enhance description with inline details
        if (entry.source_type === 'sale' && entry.source_id && salesData.has(entry.source_id)) {
          const sale = salesData.get(entry.source_id);
          const items = sale.items || [];
          
          if (items.length > 0) {
            // Show first 4-5 items with quantities
            const displayItems = items.slice(0, 5).map((item: any) => {
              const qty = item.quantity > 1 ? ` (${item.quantity})` : '';
              const itemName = item.product_name || item.product?.name || item.description || `Product #${item.product_id}`;
              return `${itemName}${qty}`;
            }).join(', ');
            
            const moreCount = Math.max(0, items.length - 5);
            const moreText = moreCount > 0 ? ` +${moreCount} more` : '';
            description = `Sale #${entry.source_id}: ${displayItems}${moreText}`;
          } else {
            description = `Sale #${entry.source_id}`;
          }
        } else if (entry.source_type === 'payment' || entry.source_type === 'sale_payment' || entry.source_type === 'customer_payment') {
          description = 'Payment received';
        } else if (entry.source_type === 'advance' || entry.source_type === 'customer_advance') {
          // Preserve backend description/notes, e.g. "Customer advance #523 ..."
          description = entry.description || 'Customer advance';
        } else if (entry.source_type === 'return' && entry.source_id) {
          description = `Return #${entry.source_id}`;
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
        margin: { bottom: 30 },
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
          // Compact header on continuation pages (page 1 already has the full header)
          if (data.pageNumber > 1) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`${customer.name || 'Customer'} — CUSTOMER LEDGER (continued)`, 40, 25);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(storeInfo.name || 'Store', doc.internal.pageSize.getWidth() - 40, 25, { align: 'right' });
          }
        },
      });

      // Closing Balance Summary — add new page if not enough room
      const finalY = (doc as any).lastAutoTable.finalY || 170;
      const pageHeight = doc.internal.pageSize.getHeight();
      let summaryY: number;
      if (finalY + 100 > pageHeight - 30) {
        doc.addPage();
        summaryY = 40;
      } else {
        summaryY = finalY + 20;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      
      // Summary box
      doc.setDrawColor(52, 73, 94);
      doc.setLineWidth(1);
      doc.rect(doc.internal.pageSize.getWidth() - 250, summaryY, 210, 60);
      
      doc.text('SUMMARY', doc.internal.pageSize.getWidth() - 145, summaryY + 18, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.credit, 0);
      
      doc.text(`Total Debit:`, doc.internal.pageSize.getWidth() - 240, summaryY + 32);
      doc.text(formatCurrency(totalDebit), doc.internal.pageSize.getWidth() - 50, summaryY + 32, { align: 'right' });
      
      doc.text(`Total Credit:`, doc.internal.pageSize.getWidth() - 240, summaryY + 46);
      doc.text(formatCurrency(totalCredit), doc.internal.pageSize.getWidth() - 50, summaryY + 46, { align: 'right' });
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Closing Balance:`, doc.internal.pageSize.getWidth() - 240, summaryY + 60);
      const closingBalance = ledgerReport.closing_balance || 0;
      doc.setTextColor(closingBalance > 0 ? 220 : 0, closingBalance > 0 ? 53 : 150, closingBalance > 0 ? 69 : 0);
      doc.text(formatCurrency(closingBalance), doc.internal.pageSize.getWidth() - 50, summaryY + 60, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      // Page footers — drawn after all content so total page count is correct
      const totalPages = doc.getNumberOfPages();
      for (let pg = 1; pg <= totalPages; pg++) {
        doc.setPage(pg);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${pg} of ${totalPages}`,
          doc.internal.pageSize.getWidth() / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      // Generate filename with store name and customer name
      const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30);
      const storeName = sanitize(storeInfo.name || 'Store');
      const customerName = sanitize(customer.name || `Customer_${customer.customer_id || customerId}`);
      const date = todayPKTDateString();
      
      doc.save(`${storeName}_${customerName}_Ledger_${date}.pdf`);
    } catch (error: any) {
      console.error("Failed to export customer report PDF", error);
      alert(error?.response?.data?.detail || "Failed to export ledger PDF");
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

  const handleDeleteNote = async () => {
    if (!deleteNoteId) return;
    try {
      await customerApi.deleteCustomerNote(customerId, deleteNoteId);
      setDeleteNoteDialogOpen(false);
      setDeleteNoteId(null);
      fetchCustomerData();
    } catch (error) {
      console.error("Failed to delete note:", error);
      alert("Failed to delete note");
    }
  };

  const formatCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `rs ${formatted}`;
  };

  const formatDate = (dateString: string) => formatPakistanDateTime(dateString);

  // Calculate advance payment status using round-robin reconciliation
  const calculateAdvanceStatus = (advances: any[], payments: CustomerPayment[]) => {
    // Sort advances by date (oldest first)
    const sortedAdvances = [...advances].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    // Sort payments by date (oldest first)
    const sortedPayments = [...payments].sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    );
    
    // Track remaining amount for each advance
    const advanceStatus = sortedAdvances.map(advance => {
      const amountMatch = advance.note_text.match(/(?:rs|\$)\s*([0-9.,]+)/i);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;
      return {
        id: advance.id,
        originalAmount: amount,
        remainingAmount: amount,
        paidAmount: 0,
      };
    });
    
    // Apply payments to advances using round-robin (oldest first)
    let remainingPayment = sortedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    for (const advStatus of advanceStatus) {
      if (remainingPayment <= 0) break;
      
      const payAmount = Math.min(remainingPayment, advStatus.remainingAmount);
      advStatus.paidAmount = payAmount;
      advStatus.remainingAmount -= payAmount;
      remainingPayment -= payAmount;
    }
    
    return advanceStatus;
  };

  // Show loading only when we have a valid ID
  if (!isValidId) {
    return null; // Will redirect in useEffect
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Customer not found</p>
          <Button onClick={() => router.push("/customers")} className="mt-4">
            Back to Customers
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col gap-6">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push("/customers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{customer.name || "Unnamed Customer"}</h1>
            <p className="text-muted-foreground">
              {customer.customer_id && `Customer ID: ${customer.customer_id}`}
              {customer.phone && ` • Phone: ${customer.phone}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLedgerDialogOpen(true)}>
            <FileText className="h-4 w-4 mr-2" /> Download Ledger
          </Button>
          <Dialog open={ledgerDialogOpen} onOpenChange={setLedgerDialogOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Ledger Date Range</DialogTitle>
                <DialogDescription>Select a date range for the ledger. Leave start date empty to include full history.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="ledger-start">Start Date</Label>
                  <Input
                    id="ledger-start"
                    type="date"
                    value={ledgerStartDate}
                    onChange={(e) => setLedgerStartDate(e.target.value)}
                    placeholder="Leave empty for full history"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ledger-end">End Date</Label>
                  <Input
                    id="ledger-end"
                    type="date"
                    value={ledgerEndDate}
                    onChange={(e) => setLedgerEndDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLedgerDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => { setLedgerDialogOpen(false); handleCustomerReportPdf(ledgerStartDate || undefined, ledgerEndDate || undefined); }}>
                  <FileText className="h-4 w-4 mr-2" /> Download PDF
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Customer</DialogTitle>
                <DialogDescription>
                  Update customer information
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input
                    id="edit-name"
                    value={editCustomer.name}
                    onChange={(e) => setEditCustomer({ ...editCustomer, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editCustomer.phone}
                    onChange={(e) => setEditCustomer({ ...editCustomer, phone: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-address">Address</Label>
                  <Input
                    id="edit-address"
                    value={editCustomer.address}
                    onChange={(e) => setEditCustomer({ ...editCustomer, address: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-opening-balance">Opening Balance (Legacy Udhar)</Label>
                  <Input
                    id="edit-opening-balance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editCustomer.opening_balance ?? 0}
                    onChange={(e) =>
                      setEditCustomer({
                        ...editCustomer,
                        opening_balance: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                  />
                  {(editCustomer.opening_balance ?? 0) > 0 && (
                    <p className="text-xs text-blue-600 font-medium">
                      {convertToWords(editCustomer.opening_balance ?? 0)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    This will adjust the customer outstanding balance.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-credit-limit">Credit Limit (optional)</Label>
                  <Input
                    id="edit-credit-limit"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Leave blank for unlimited"
                    value={editCustomer.credit_limit ?? ""}
                    onChange={(e) =>
                      setEditCustomer({
                        ...editCustomer,
                        credit_limit: e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                  />
                  {editCustomer.credit_limit && editCustomer.credit_limit > 0 && (
                    <p className="text-xs text-blue-600 font-medium">
                      {convertToWords(editCustomer.credit_limit)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Max outstanding balance allowed. Leave blank for unlimited.
                  </p>
                </div>

              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateCustomer}>
                  Update Customer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <DollarSign className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>
                  Record a payment towards outstanding balance (udhar)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className={`p-4 rounded-md border ${
                  customer.outstanding_balance < 0 
                    ? "bg-green-50 border-green-200" 
                    : "bg-blue-50 border-blue-200"
                }`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-sm font-medium ${
                      customer.outstanding_balance < 0 ? "text-green-900" : "text-blue-900"
                    }`}>
                      {customer.outstanding_balance < 0 ? "Prepaid Credit:" : "Outstanding Balance:"}
                    </span>
                    <span className={`text-lg font-bold ${
                      customer.outstanding_balance < 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      {customer.outstanding_balance < 0 
                        ? `+${formatCurrency(Math.abs(customer.outstanding_balance))}`
                        : formatCurrency(customer?.outstanding_balance || 0)
                      }
                    </span>
                  </div>
                  <p className={`text-xs ${
                    customer.outstanding_balance < 0 ? "text-green-700" : "text-blue-700"
                  }`}>
                    {customer.outstanding_balance < 0 
                      ? "✅ Customer has prepaid credit. Payments will add to this credit or can be refunded."
                      : "ℹ️ This payment is recorded at customer level (ledger) to avoid ambiguous auto-distribution across invoices/advances."
                    }
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-amount">Payment Amount ($)</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: parseFloat(e.target.value) || 0 })}
                  />
                  {newPayment.amount > 0 && (
                    <p className="text-xs text-blue-600 font-medium">
                      {convertToWords(newPayment.amount)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-method">Payment Method</Label>
                  <select
                    id="payment-method"
                    className="w-full p-2 border rounded-md"
                    value={newPayment.payment_method}
                    onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="mobile">Mobile Payment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-note">Reference Note (Optional)</Label>
                  <Input
                    id="payment-note"
                    placeholder="Payment reference or notes"
                    value={newPayment.reference_note}
                    onChange={(e) => setNewPayment({ ...newPayment, reference_note: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRecordPayment}>
                  Record Payment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Buy on Behalf
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Buy on Behalf of Customer</DialogTitle>
                <DialogDescription>
                  Record amount paid on behalf of customer - this will be added to their balance
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className={`p-4 rounded-md border ${
                  customer.outstanding_balance > 0 
                    ? "bg-orange-50 border-orange-200" 
                    : customer.outstanding_balance < 0
                      ? "bg-green-50 border-green-200"
                      : "bg-blue-50 border-blue-200"
                }`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-sm font-medium ${
                      customer.outstanding_balance > 0 
                        ? "text-orange-900" 
                        : customer.outstanding_balance < 0
                          ? "text-green-900"
                          : "text-blue-900"
                    }`}>
                      Current Balance:
                    </span>
                    <span className={`text-lg font-bold ${
                      customer.outstanding_balance > 0 
                        ? "text-red-600" 
                        : customer.outstanding_balance < 0
                          ? "text-green-600"
                          : "text-gray-900"
                    }`}>
                      {customer.outstanding_balance < 0 
                        ? `Credit: +${formatCurrency(Math.abs(customer.outstanding_balance))}`
                        : customer.outstanding_balance > 0
                          ? `Udhar: ${formatCurrency(customer.outstanding_balance)}`
                          : formatCurrency(0)
                      }
                    </span>
                  </div>
                  <p className={`text-xs ${
                    customer.outstanding_balance > 0 
                      ? "text-orange-700" 
                      : customer.outstanding_balance < 0
                        ? "text-green-700"
                        : "text-blue-700"
                  }`}>
                    {customer.outstanding_balance > 0
                      ? "⚠️ This amount will be added to customer's balance (they will owe you more)"
                      : customer.outstanding_balance < 0
                        ? "✅ Customer has prepaid credit. This will add to their credit balance."
                        : "ℹ️ This amount will be added to customer's balance (they will owe you)"
                    }
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="advance-amount">Amount Paid ($)</Label>
                  <Input
                    id="advance-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newAdvance.amount}
                    onChange={(e) => setNewAdvance({ ...newAdvance, amount: parseFloat(e.target.value) || 0 })}
                  />
                  {newAdvance.amount > 0 && (
                    <p className="text-xs text-blue-600 font-medium">
                      {convertToWords(newAdvance.amount)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="advance-description">Description *</Label>
                  <Textarea
                    id="advance-description"
                    placeholder="What did you buy? (e.g., Grocery items, Medicine, etc.)"
                    value={newAdvance.description}
                    onChange={(e) => setNewAdvance({ ...newAdvance, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="advance-payment-method">Payment Method</Label>
                  <select
                    id="advance-payment-method"
                    className="w-full p-2 border rounded-md"
                    value={newAdvance.payment_method}
                    onChange={(e) => setNewAdvance({ ...newAdvance, payment_method: e.target.value })}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="mobile">Mobile Payment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAdvanceDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddAdvance}>
                  Add to Balance
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Customer Profile Cards */}
      <div className="shrink-0 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{customer.name || "Not provided"}</span>
            </div>
            {customer.customer_id && (
              <div className="flex items-center gap-2">
                <Badge variant="outline">{customer.customer_id}</Badge>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{customer.email}</span>
              </div>
            )}
            {customer.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{customer.address}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Member since {formatDate(customer.member_since)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Purchases</span>
              <Badge variant="secondary">{financialSummary?.total_purchases || 0}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Spent</span>
              <span className="font-medium">{formatCurrency(financialSummary?.total_spent || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Avg Purchase</span>
              <span className="font-medium">{formatCurrency(financialSummary?.average_purchase_value || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {customer.outstanding_balance < 0 ? "Prepaid Credit" : customer.outstanding_balance > 0 ? "Outstanding Balance" : "Balance"}
              </span>
              <Badge variant={customer.outstanding_balance > 0 ? "destructive" : customer.outstanding_balance < 0 ? "default" : "secondary"} 
                     className={customer.outstanding_balance < 0 ? "bg-green-600" : ""}>
                {customer.outstanding_balance < 0 ? formatCurrency(Math.abs(customer.outstanding_balance)) : formatCurrency(customer.outstanding_balance)}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Credit Limit</span>
              <span className="font-medium">
                {customer.credit_limit != null
                  ? <Badge variant={customer.outstanding_balance >= customer.credit_limit ? "destructive" : "outline"}>
                      {formatCurrency(customer.credit_limit)}
                    </Badge>
                  : <span className="text-muted-foreground text-sm">Unlimited</span>
                }
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full"
              onClick={() => router.push(`/sales?customer=${customer.customer_id || customer.phone}`)}
            >
              <ShoppingBag className="h-4 w-4 mr-2" />
              New Sale
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCustomerReportExport}
            >
              <FileText className="h-4 w-4 mr-2" />
              Make Report (CSV)
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSendReminder}
              disabled={!customer.phone || customer.outstanding_balance <= 0}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Send Udhar Reminder
            </Button>
            <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Customer Note</DialogTitle>
                  <DialogDescription>
                    Add a note about this customer
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="note-type">Note Type</Label>
                    <select
                      id="note-type"
                      className="w-full p-2 border rounded-md"
                      value={newNote.note_type}
                      onChange={(e) => setNewNote({ ...newNote, note_type: e.target.value })}
                    >
                      <option value="general">General</option>
                      <option value="credit_history">Credit History</option>
                      <option value="special_instruction">Special Instruction</option>
                      <option value="reminder">Reminder</option>
                      <option value="preference">Preference</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="note-text">Note</Label>
                    <Textarea
                      id="note-text"
                      placeholder="Enter your note here..."
                      value={newNote.note_text}
                      onChange={(e) => setNewNote({ ...newNote, note_text: e.target.value })}
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddNote}>
                    Add Note
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>



      {/* Tabs for detailed information */}
      <Tabs defaultValue="purchases" className="flex-1 min-h-0 flex flex-col gap-4">
        <TabsList className="shrink-0">
          <TabsTrigger value="purchases">Purchase History</TabsTrigger>
          <TabsTrigger value="returns">Return History</TabsTrigger>
          <TabsTrigger value="advances">Journel Entries ({customer.notes.filter((n: CustomerNote) => n.note_type === 'advance_payment').length})</TabsTrigger>
          <TabsTrigger value="payments">Payment History ({customer.payments.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({customer.notes.filter((n: CustomerNote) => n.note_type !== 'advance_payment').length})</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="flex-1 min-h-0 overflow-y-auto">
          <PurchaseHistoryTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="returns" className="flex-1 min-h-0 overflow-y-auto">
          <ReturnHistoryTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="advances" className="flex-1 min-h-0 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>Buy on Behalf History</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.notes.filter((n: CustomerNote) => n.note_type === 'advance_payment').length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No advance payments yet. Use "Buy on Behalf" to record items purchased for this customer.
                </p>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const advances = customer.notes.filter((note: CustomerNote) => note.note_type === 'advance_payment');
                    const advanceStatus = calculateAdvanceStatus(advances, customer.payments);
                    
                    return advances.map((note: CustomerNote) => {
                      // Extract amount from note_text (format: "Paid $XX.XX on behalf via cash: description")
                      const amountMatch = note.note_text.match(/(?:rs|\$)\s*([0-9.,]+)/i);
                      const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;
                      const methodMatch = note.note_text.match(/via ([a-z_]+):/i);
                      const method = methodMatch ? methodMatch[1] : 'cash';
                      const descriptionMatch = note.note_text.match(/: (.+)$/);
                      const description = descriptionMatch ? descriptionMatch[1] : note.note_text;
                      
                      // Find status for this advance
                      const status = advanceStatus.find(s => s.id === note.id);
                      const isPaid = status && status.remainingAmount === 0;
                      const isPartiallyPaid = status && status.paidAmount > 0 && status.remainingAmount > 0;
                      
                      return (
                        <div 
                          key={note.id} 
                          className={`border rounded-lg p-4 transition-all ${
                            isPaid ? 'bg-muted/30 opacity-60' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Badge variant={isPaid ? "outline" : "destructive"} className={isPaid ? "bg-muted" : ""}>
                                  {formatCurrency(amount)}
                                </Badge>
                                {isPaid && (
                                  <Badge variant="default" className="bg-green-600">
                                    ✓ Paid
                                  </Badge>
                                )}
                                {isPartiallyPaid && (
                                  <Badge variant="secondary">
                                    {formatCurrency(status.paidAmount)} / {formatCurrency(amount)} paid
                                  </Badge>
                                )}
                                <Badge variant="outline" className="capitalize">
                                  {method.replace('_', ' ')}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {formatDate(note.created_at)}
                                </span>
                              </div>
                              <p className={`text-sm ${isPaid ? 'text-muted-foreground line-through' : ''}`}>
                                {description}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    disabled={isPaid}
                                    className={isPaid ? "opacity-50 cursor-not-allowed" : ""}
                                  >
                                    <CreditCard className="h-4 w-4 mr-2" />
                                    Record Payment
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Record Payment</DialogTitle>
                                    <DialogDescription>
                                      Record a payment against this advance
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                      <Label>Advance Amount</Label>
                                      <div className="text-2xl font-bold text-red-600">
                                        {formatCurrency(amount)}
                                      </div>
                                      <p className="text-sm text-muted-foreground">{description}</p>
                                      {status && status.paidAmount > 0 && (
                                        <div className="mt-2 p-2 bg-muted rounded">
                                          <p className="text-sm">
                                            Already paid: <span className="font-medium text-green-600">{formatCurrency(status.paidAmount)}</span>
                                          </p>
                                          <p className="text-sm">
                                            Remaining: <span className="font-medium text-red-600">{formatCurrency(status.remainingAmount)}</span>
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="payment-amount">Payment Amount</Label>
                                      <Input
                                        id="payment-amount"
                                        type="number"
                                        step="0.01"
                                        placeholder="Enter amount"
                                        value={newPayment.amount || ''}
                                        onChange={(e) => setNewPayment({ ...newPayment, amount: parseFloat(e.target.value) || 0 })}
                                      />
                                      {status && status.remainingAmount > 0 && (
                                        <Button
                                          type="button"
                                          variant="link"
                                          size="sm"
                                          className="p-0 h-auto text-xs"
                                          onClick={() => setNewPayment({ ...newPayment, amount: status.remainingAmount })}
                                        >
                                          Pay remaining: {formatCurrency(status.remainingAmount)}
                                        </Button>
                                      )}
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="payment-method">Payment Method</Label>
                                      <select
                                        id="payment-method"
                                        className="w-full p-2 border rounded-md"
                                        value={newPayment.payment_method}
                                        onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })}
                                      >
                                        <option value="cash">Cash</option>
                                        <option value="card">Card</option>
                                        <option value="mobile">Mobile Payment</option>
                                        <option value="bank_transfer">Bank Transfer</option>
                                      </select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="payment-note">Note (Optional)</Label>
                                      <Input
                                        id="payment-note"
                                        placeholder="Payment reference or note"
                                        value={newPayment.reference_note}
                                        onChange={(e) => setNewPayment({ ...newPayment, reference_note: e.target.value })}
                                      />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => {
                                      setNewPayment({ amount: 0, payment_method: 'cash', reference_note: '' });
                                    }}>
                                      Cancel
                                    </Button>
                                    <Button onClick={handleRecordPayment}>
                                      Record Payment
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="flex-1 min-h-0 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              <AllPaymentsTab customerId={customerId} customerPayments={customer.payments} onRefresh={fetchCustomerData} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="flex-1 min-h-0 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>Customer Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.notes.filter((n: CustomerNote) => n.note_type !== 'advance_payment').length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No notes yet. Add notes to track customer preferences and history.
                </p>
              ) : (
                <div className="space-y-4">
                  {customer.notes
                    .filter((note: CustomerNote) => note.note_type !== 'advance_payment')
                    .map((note) => (
                      <div key={note.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="outline" className="capitalize">
                            {note.note_type.replace('_', ' ')}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {formatDate(note.created_at)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setDeleteNoteId(note.id); setDeleteNoteDialogOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm">{note.note_text}</p>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                    <h2 className="text-lg font-bold text-gray-900 mb-1">
                      {receiptData.type === "advance" ? "ADVANCE RECEIPT" : "PAYMENT RECEIPT"}
                    </h2>
                    <p className="text-xs text-gray-600">{formatPakistanDateTime(receiptData.date)}</p>
                  </div>

                  {/* Customer Info */}
                  <div className="mb-3 pb-3 border-b border-dashed border-gray-300">
                    <p className="text-xs font-semibold text-gray-600 mb-1">CUSTOMER:</p>
                    <p className="text-sm font-medium text-gray-900">{receiptData.customerName}</p>
                    {receiptData.customerPhone && (
                      <p className="text-xs text-gray-600">{receiptData.customerPhone}</p>
                    )}
                  </div>

                  {/* Payment Details */}
                  <div className="mb-3 pb-3 border-b-2 border-dashed border-gray-400">
                    <p className="text-xs font-semibold text-gray-600 mb-2">PAYMENT DETAILS:</p>
                    <div className="flex justify-between text-base font-bold pt-1 border-t-2 border-gray-900">
                      <span className="text-gray-900">AMOUNT:</span>
                      <span className="text-gray-900">rs {receiptData.amount.toFixed(2)}</span>
                    </div>
                    {receiptData.method && (
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-600">Method:</span>
                        <span className="font-medium text-gray-900 capitalize">{receiptData.method}</span>
                      </div>
                    )}
                    {receiptData.reference && (
                      <div className="text-sm mt-2">
                        <span className="text-gray-600">Reference: </span>
                        <span className="font-medium text-gray-900">{receiptData.reference}</span>
                      </div>
                    )}
                    {typeof receiptData.balance === "number" && (
                      <div className="flex justify-between text-sm mt-2 pt-2 border-t border-dashed border-gray-300">
                        <span className="text-gray-600">Outstanding Balance:</span>
                        <span className={`font-semibold ${receiptData.balance > 0 ? "text-red-600" : "text-green-700"}`}>
                          rs {receiptData.balance.toFixed(2)}
                        </span>
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

      {creditLimitAlert && (
        <CreditLimitAlert
          open={!!creditLimitAlert}
          onClose={() => setCreditLimitAlert(null)}
          customerName={customer?.name || undefined}
          limit={creditLimitAlert.limit}
          current={creditLimitAlert.current}
          available={creditLimitAlert.available}
          attempted={creditLimitAlert.attempted}
        />
      )}
    </div>
  );
}

function AllPaymentsTab({ customerId, customerPayments, onRefresh }: { customerId: number, customerPayments: CustomerPayment[], onRefresh: () => void }) {
  const [purchases, setPurchases] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editPayment, setEditPayment] = useState<{ id: number; amount: number; method: string; note: string } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchPurchases();
  }, [customerId]);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const data = await customerApi.getCustomerPurchases(customerId);
      setPurchases(data);
    } catch (error) {
      console.error("Failed to fetch purchases:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editPayment) return;
    setEditSaving(true);
    try {
      await customerApi.updateCustomerPayment(customerId, editPayment.id, {
        amount: editPayment.amount,
        payment_method: editPayment.method,
        reference_note: editPayment.note,
      });
      setEditDialogOpen(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to update payment", err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      await customerApi.deleteCustomerPayment(customerId, deleteConfirmId);
      setDeleteDialogOpen(false);
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete payment", err);
    } finally {
      setDeleting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `rs ${formatted}`;
  };

  const formatDate = (dateString: string) => formatPakistanDateTime(dateString);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Combine all payments
  const allPayments: Array<{
    type: string;
    date: string;
    amount: number;
    method: string;
    note: string;
    id: string;
    saleId?: number;
    total?: number;
    due?: number;
  }> = [];

  // Add customer payments (general account payments)
  customerPayments.forEach(payment => {
    allPayments.push({
      type: 'customer_payment',
      date: payment.payment_date,
      amount: payment.amount,
      method: payment.payment_method,
      note: payment.reference_note || '-',
      id: `cp-${payment.id}`,
    });
  });

  // Add purchase payments (direct sale payments)
  if (purchases && purchases.purchases) {
    purchases.purchases.forEach((purchase: any) => {
      if (purchase.amount_paid > 0) {
        allPayments.push({
          type: 'purchase_payment',
          date: purchase.created_at,
          amount: purchase.amount_paid,
          method: purchase.payment_method,
          note: `Sale #${purchase.id} (${purchase.items_count} items)`,
          id: `pp-${purchase.id}`,
          saleId: purchase.id,
          total: purchase.total,
          due: purchase.amount_due,
        });
      }
    });
  }

  // Sort by date (newest first)
  allPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (allPayments.length === 0) {
    return (
      <p className="text-center py-8 text-muted-foreground">
        No payment history yet.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allPayments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell>{formatDate(payment.date)}</TableCell>
              <TableCell>
                <Badge variant={payment.type === 'customer_payment' ? 'default' : 'secondary'}>
                  {payment.type === 'customer_payment' ? 'Account Payment' : 'Sale Payment'}
                </Badge>
              </TableCell>
              <TableCell className="font-medium text-green-600">
                {formatCurrency(payment.amount)}
                {payment.type === 'purchase_payment' && payment.total && (
                  <span className="text-xs text-muted-foreground ml-1">
                    / {formatCurrency(payment.total)}
                  </span>
                )}
              </TableCell>
              <TableCell className="capitalize">{payment.method.replace('_', ' ')}</TableCell>
              <TableCell>{payment.note}</TableCell>
              <TableCell>
                {payment.type === 'customer_payment' && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const rawId = parseInt(payment.id.replace('cp-', ''));
                        setEditPayment({ id: rawId, amount: payment.amount, method: payment.method, note: payment.note === '-' ? '' : payment.note });
                        setEditDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        const rawId = parseInt(payment.id.replace('cp-', ''));
                        setDeleteConfirmId(rawId);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit Payment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
          </DialogHeader>
          {editPayment && (
            <div className="space-y-4">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={editPayment.amount}
                  onChange={(e) => setEditPayment({ ...editPayment, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={editPayment.method}
                  onChange={(e) => setEditPayment({ ...editPayment, method: e.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label>Note</Label>
                <Input
                  value={editPayment.note}
                  onChange={(e) => setEditPayment({ ...editPayment, note: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleEditSave} disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Payment Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to remove this payment from history? This will recalculate the customer balance and ledger.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PurchaseHistoryTab({ customerId }: { customerId: number }) {
  const [purchases, setPurchases] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchPurchases();
  }, [customerId]);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const data = await customerApi.getCustomerPurchases(customerId);
      setPurchases(data);
    } catch (error) {
      console.error("Failed to fetch purchases:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `rs ${formatted}`;
  };

  const formatDate = (dateString: string) => formatPakistanDate(dateString);

  const handleRowClick = (purchaseId: number) => {
    setSelectedPurchaseId(purchaseId);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!purchases || purchases.purchases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Purchase History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-8 text-muted-foreground">
            No purchase history found for this customer.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Purchase History ({purchases.total_count} purchases)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.purchases.map((purchase: any) => (
                <TableRow
                  key={purchase.id}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handleRowClick(purchase.id)}
                >
                  <TableCell>{formatDate(purchase.created_at)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(purchase.total)}</TableCell>
                  <TableCell className="text-green-600">{formatCurrency(purchase.amount_paid)}</TableCell>
                  <TableCell className={purchase.amount_due > 0 ? "text-red-600" : ""}>
                    {formatCurrency(purchase.amount_due)}
                  </TableCell>
                  <TableCell className="capitalize">{purchase.payment_method}</TableCell>
                  <TableCell>{purchase.items_count} items</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle>Sale Invoice</DialogTitle>
            <DialogDescription>
              View details of this sale/invoice.
            </DialogDescription>
          </DialogHeader>
          {selectedPurchaseId && (
            <iframe
              src={`/sales/invoice/${selectedPurchaseId}`}
              title="Invoice"
              className="w-full h-[70vh] border rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReturnHistoryTab({ customerId }: { customerId: number }) {
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReturns();
  }, [customerId]);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const response = await api.get('/returns', {
        params: { customer_id: customerId, limit: 200 },
      });
      setReturns(response.data || []);
    } catch (error) {
      console.error('Failed to fetch returns:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `rs ${formatted}`;
  };

  const formatDate = (dateString: string) => formatPakistanDate(dateString);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!returns || returns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Return History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-8 text-muted-foreground">
            No returns found for this customer.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Return History ({returns.length} returns)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Return ID</TableHead>
              <TableHead>Sale ID</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Refund</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {returns.map((ret) => (
              <TableRow key={ret.id}>
                <TableCell>{formatDate(ret.created_at)}</TableCell>
                <TableCell className="font-medium">#{ret.id}</TableCell>
                <TableCell>{ret.sale_id ? `#${ret.sale_id}` : '-'}</TableCell>
                <TableCell>{ret.items?.length || 0}</TableCell>
                <TableCell className="text-red-600">{formatCurrency(ret.refund_amount || 0)}</TableCell>
                <TableCell className="capitalize">{ret.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}