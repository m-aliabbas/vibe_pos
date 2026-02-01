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
import { customerApi, CustomerResponse, CustomerNote, CustomerPayment } from "@/lib/api";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";

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
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Form states
  const [newNote, setNewNote] = useState({ note_type: "general", note_text: "" });
  const [newPayment, setNewPayment] = useState({ amount: 0, payment_method: "cash", reference_note: "" });
  const [editCustomer, setEditCustomer] = useState({
    name: "",
    email: "",
    address: "",
  });

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
        email: customerData.email || "",
        address: customerData.address || "",
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
      await customerApi.recordCustomerPayment(customerId, newPayment);
      setPaymentDialogOpen(false);
      setNewPayment({ amount: 0, payment_method: "cash", reference_note: "" });
      fetchCustomerData();
    } catch (error) {
      console.error("Failed to record payment:", error);
      alert("Failed to record payment");
    }
  };

  const handleUpdateCustomer = async () => {
    if (!isValidId) return;
    
    try {
      await customerApi.updateCustomer(customerId, editCustomer);
      setEditDialogOpen(false);
      fetchCustomerData();
    } catch (error) {
      console.error("Failed to update customer:", error);
      alert("Failed to update customer");
    }
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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
                  <Label htmlFor="edit-address">Address</Label>
                  <Input
                    id="edit-address"
                    value={editCustomer.address}
                    onChange={(e) => setEditCustomer({ ...editCustomer, address: e.target.value })}
                  />
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
          <TabsTrigger value="notes">Notes ({customer.notes.length})</TabsTrigger>
          <TabsTrigger value="payments">Payment History ({customer.payments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases">
          <PurchaseHistoryTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>Customer Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.notes.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No notes yet. Add notes to track customer preferences and history.
                </p>
              ) : (
                <div className="space-y-4">
                  {customer.notes.map((note) => (
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

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.payments.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No payment history yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.payment_date)}</TableCell>
                        <TableCell className="font-medium text-green-600">
                          +{formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell className="capitalize">{payment.payment_method}</TableCell>
                        <TableCell>{payment.reference_note || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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