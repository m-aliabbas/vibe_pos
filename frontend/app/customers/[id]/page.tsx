"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CreditLimitAlert, parseCreditLimitError } from "@/components/CreditLimitAlert";

export default function CustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap params Promise using React.use()
  const unwrappedParams = use(params);
  
  const router = useRouter();
  const { token, isLoading } = useAuthStore();
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [financialSummary, setFinancialSummary] = useState<any>(null);

  // Dialog states
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
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

  const handleCustomerReportPdf = async () => {
    if (!isValidId || !customer) return;
    try {
      // Fetch all transaction data
      const purchasesData = await customerApi.getCustomerPurchases(customerId);
      
      // Build ledger entries
      interface LedgerEntry {
        date: Date;
        description: string;
        debit: number;
        credit: number;
        balance: number;
      }

      const ledgerEntries: LedgerEntry[] = [];
      
      // Opening balance
      let runningBalance = customer.opening_balance || 0;
      
      // Collect all transactions
      const transactions: Array<{
        date: Date;
        description: string;
        type: 'sale' | 'sale_payment' | 'payment' | 'advance';
        amount: number;
        saleId?: number;
      }> = [];

      // Add sales (Debit - increases balance owed)
      if (purchasesData.purchases) {
        purchasesData.purchases.forEach((sale: any) => {
          // Always add the full sale amount as Debit
          transactions.push({
            date: new Date(sale.created_at),
            description: `Sale #${sale.id} - ${sale.items_count} items`,
            type: 'sale',
            amount: sale.total, // Full sale amount
            saleId: sale.id,
          });
          
          // If customer paid something at time of sale, add it as Credit
          if (sale.amount_paid > 0) {
            transactions.push({
              date: new Date(sale.created_at),
              description: `Payment on Sale #${sale.id} - ${sale.payment_method}`,
              type: 'sale_payment',
              amount: sale.amount_paid,
              saleId: sale.id,
            });
          }
        });
      }

      // Add payments (Credit - reduces balance owed)
      if (customer.payments) {
        customer.payments.forEach((payment: CustomerPayment) => {
          transactions.push({
            date: new Date(payment.payment_date),
            description: `Payment received - ${payment.payment_method}${payment.reference_note ? ': ' + payment.reference_note : ''}`,
            type: 'payment',
            amount: payment.amount,
          });
        });
      }

      // Add advances (Debit - increases balance owed)
      if (customer.notes) {
        customer.notes
          .filter((note: CustomerNote) => note.note_type === 'advance_payment')
          .forEach((note: CustomerNote) => {
            const amountMatch = note.note_text.match(/(?:rs|\$)\s*([0-9.,]+)/i);
            const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;
            const descriptionMatch = note.note_text.match(/: (.+)$/);
            const description = descriptionMatch ? descriptionMatch[1] : note.note_text;
            
            transactions.push({
              date: new Date(note.created_at),
              description: `Advance Payment - ${description}`,
              type: 'advance',
              amount: amount,
            });
          });
      }

      // Sort by date (oldest first), then by type (sales before payments on same date)
      transactions.sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        
        // On same date, process in order: sale -> sale_payment -> payment
        const typeOrder = { sale: 1, sale_payment: 2, payment: 3, advance: 4 };
        return typeOrder[a.type] - typeOrder[b.type];
      });

      // Calculate running balance and create ledger entries
      transactions.forEach(txn => {
        let debit = 0;
        let credit = 0;

        if (txn.type === 'sale' || txn.type === 'advance') {
          debit = txn.amount;
          runningBalance += txn.amount;
        } else if (txn.type === 'payment' || txn.type === 'sale_payment') {
          credit = txn.amount;
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
      doc.text('CUSTOMER LEDGER', doc.internal.pageSize.getWidth() / 2, 100, { align: 'center' });
      
      // Customer details
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Customer: ${customer.name || 'N/A'}`, 40, 120);
      doc.text(`ID: ${customer.customer_id || 'N/A'}`, 40, 134);
      if (customer.phone) doc.text(`Phone: ${customer.phone}`, 300, 120);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 300, 134);
      
      // Opening Balance
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Opening Balance: ${formatCurrency(customer.opening_balance || 0)}`, 40, 155);
      
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
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text(
            `Page ${data.pageNumber} of ${pageCount}`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 20,
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
      doc.text(`Closing Balance:`, doc.internal.pageSize.getWidth() - 240, finalY + 80);
      doc.setTextColor(runningBalance > 0 ? 220 : 0, runningBalance > 0 ? 53 : 150, runningBalance > 0 ? 69 : 0);
      doc.text(formatCurrency(runningBalance), doc.internal.pageSize.getWidth() - 50, finalY + 80, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      // Generate filename with store name and customer name
      const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30);
      const storeName = sanitize(storeInfo.name || 'Store');
      const customerName = sanitize(customer.name || `Customer_${customer.customer_id || customerId}`);
      const date = new Date().toISOString().split('T')[0];
      
      doc.save(`${storeName}_${customerName}_Ledger_${date}.pdf`);
    } catch (error: any) {
      console.error("Failed to export customer report PDF", error);
      alert(error?.response?.data?.detail || "Failed to export ledger PDF");
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
          <div><strong>Customer:</strong> ${receiptData.customerName}</div>
          ${receiptData.customerPhone ? `<div><strong>Phone:</strong> ${receiptData.customerPhone}</div>` : ""}
          <div><strong>Date:</strong> ${new Date(receiptData.date).toLocaleString()}</div>
        </div>
        <div style="border-top:1px dashed #999; border-bottom:1px dashed #999; padding:8px 0; margin:8px 0;">
          <div style="display:flex; justify-content:space-between;"><span>Amount</span><strong>rs ${receiptData.amount.toFixed(2)}</strong></div>
          ${receiptData.method ? `<div style="display:flex; justify-content:space-between;"><span>Method</span><span>${receiptData.method}</span></div>` : ""}
          ${receiptData.reference ? `<div style="margin-top:6px;"><strong>Reference:</strong> ${receiptData.reference}</div>` : ""}
          ${typeof receiptData.balance === "number" ? `<div style="display:flex; justify-content:space-between; margin-top:6px;"><span>Outstanding</span><strong>rs ${receiptData.balance.toFixed(2)}</strong></div>` : ""}
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

  const handleDeleteNote = async (noteId: number) => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    if (!isValidId) return;

    try {
      await customerApi.deleteCustomerNote(customerId, noteId);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
          <Button variant="outline" onClick={handleCustomerReportPdf}>
            <FileText className="h-4 w-4 mr-2" /> Download Ledger
          </Button>
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
                <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-blue-900">Outstanding Balance:</span>
                    <span className="text-lg font-bold text-red-600">
                      {formatCurrency(customer?.outstanding_balance || 0)}
                    </span>
                  </div>
                  <p className="text-xs text-blue-700">
                    ℹ️ This payment will be automatically reconciled against the oldest unpaid invoices first.
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
                <div className="bg-orange-50 p-4 rounded-md border border-orange-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-orange-900">Current Balance:</span>
                    <span className="text-lg font-bold text-red-600">
                      {formatCurrency(customer?.outstanding_balance || 0)}
                    </span>
                  </div>
                  <p className="text-xs text-orange-700">
                    ⚠️ This amount will be added to customer's balance (they will owe you)
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <span className="text-sm text-muted-foreground">Outstanding Balance</span>
              <Badge variant={customer.outstanding_balance > 0 ? "destructive" : "secondary"}>
                {formatCurrency(customer.outstanding_balance)}
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
              Send Due Reminder
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
      <Tabs defaultValue="purchases" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchases">Purchase History</TabsTrigger>
          <TabsTrigger value="returns">Return History</TabsTrigger>
          <TabsTrigger value="advances">Journel Entries ({customer.notes.filter((n: CustomerNote) => n.note_type === 'advance_payment').length})</TabsTrigger>
          <TabsTrigger value="payments">Payment History ({customer.payments.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({customer.notes.filter((n: CustomerNote) => n.note_type !== 'advance_payment').length})</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases">
          <PurchaseHistoryTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="returns">
          <ReturnHistoryTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="advances">
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
                      const amountMatch = note.note_text.match(/\$([0-9.,]+)/);
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

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              <AllPaymentsTab customerId={customerId} customerPayments={customer.payments} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
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
                              onClick={() => handleDeleteNote(note.id)}
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
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{receiptData?.title || "Receipt"}</DialogTitle>
            <DialogDescription>
              Customer payment/advance receipt.
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
                <div><span className="font-medium">Customer:</span> {receiptData.customerName}</div>
                {receiptData.customerPhone && (
                  <div><span className="font-medium">Phone:</span> {receiptData.customerPhone}</div>
                )}
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
                {receiptData.reference && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Ref: {receiptData.reference}
                  </div>
                )}
                {typeof receiptData.balance === "number" && (
                  <div className="flex justify-between mt-2">
                    <span>Outstanding</span>
                    <span className="font-semibold">rs {receiptData.balance.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReceiptDialogOpen(false)}
            >
              Close
            </Button>
            <Button onClick={handlePrintReceipt}>Print Receipt</Button>
          </DialogFooter>
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

function AllPaymentsTab({ customerId, customerPayments }: { customerId: number, customerPayments: CustomerPayment[] }) {
  const [purchases, setPurchases] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Note</TableHead>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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