"use client";

import { useState, useEffect } from "react";
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

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, token } = useAuthStore();
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
    current_mileage: undefined as number | undefined,
    oil_change_interval: undefined as number | undefined,
    next_oil_change_mileage: undefined as number | undefined,
  });
  const [showVehicleEdit, setShowVehicleEdit] = useState(false);

  const customerId = parseInt(params.id as string);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchCustomerData();
  }, [token, customerId]);

  const fetchCustomerData = async () => {
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
        current_mileage: customerData.current_mileage || undefined,
        oil_change_interval: customerData.oil_change_interval || undefined,
        next_oil_change_mileage: customerData.next_oil_change_mileage || undefined,
      });
    } catch (error) {
      console.error("Failed to fetch customer:", error);
      router.push("/customers");
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.note_text.trim()) return;

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
                
                {/* Vehicle Info Section */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="checkbox"
                      id="edit-vehicle-info"
                      checked={showVehicleEdit}
                      onChange={(e) => setShowVehicleEdit(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <Label htmlFor="edit-vehicle-info" className="mb-0 cursor-pointer">
                      Edit Vehicle Information
                    </Label>
                  </div>
                  
                  {showVehicleEdit && (
                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg space-y-4">
                      <h3 className="font-semibold text-sm">Vehicle Oil Change Details</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-current_mileage">Current Mileage (km)</Label>
                          <Input
                            id="edit-current_mileage"
                            type="number"
                            placeholder="e.g., 441221"
                            value={editCustomer.current_mileage || ""}
                            onChange={(e) => {
                              const mileage = e.target.value ? parseInt(e.target.value) : undefined;
                              const nextMileage = mileage && editCustomer.oil_change_interval
                                ? mileage + editCustomer.oil_change_interval
                                : undefined;
                              setEditCustomer({ 
                                ...editCustomer, 
                                current_mileage: mileage,
                                next_oil_change_mileage: nextMileage
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-oil_change_interval">Oil Change Interval (km)</Label>
                          <Input
                            id="edit-oil_change_interval"
                            type="number"
                            placeholder="e.g., 3000"
                            value={editCustomer.oil_change_interval || ""}
                            onChange={(e) => {
                              const interval = e.target.value ? parseInt(e.target.value) : undefined;
                              const nextMileage = editCustomer.current_mileage && interval
                                ? editCustomer.current_mileage + interval
                                : undefined;
                              setEditCustomer({ 
                                ...editCustomer, 
                                oil_change_interval: interval,
                                next_oil_change_mileage: nextMileage
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-next_oil_change_mileage">Next Oil Change (km)</Label>
                          <Input
                            id="edit-next_oil_change_mileage"
                            type="number"
                            placeholder="e.g., 444221"
                            value={editCustomer.next_oil_change_mileage || ""}
                            readOnly
                            className="bg-gray-100"
                          />
                        </div>
                      </div>
                    </div>
                  )}
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

      {/* Vehicle Oil Change Information */}
      {(customer.current_mileage || customer.oil_change_interval || customer.next_oil_change_mileage) && (
        <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Vehicle Oil Change Tracking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Current Mileage</div>
                <div className="text-2xl font-bold">{customer.current_mileage?.toLocaleString() || "-"} km</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Oil Change Interval</div>
                <div className="text-2xl font-bold">{customer.oil_change_interval?.toLocaleString() || "-"} km</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Next Oil Change Due</div>
                <div className="text-2xl font-bold">{customer.next_oil_change_mileage?.toLocaleString() || "-"} km</div>
                {customer.current_mileage && customer.next_oil_change_mileage && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Remaining: {(customer.next_oil_change_mileage - customer.current_mileage).toLocaleString()} km
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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