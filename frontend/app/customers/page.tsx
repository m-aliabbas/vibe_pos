"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { customerApi, CustomerListResponse, CustomerCreate } from "@/lib/api";
import {
  Search,
  Plus,
  UserCheck,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Calendar,
  Eye,
  Edit,
  Trash2,
} from "lucide-react";

export default function CustomersPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuthStore();
  const [customers, setCustomers] = useState<CustomerListResponse[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [totalCount, setTotalCount] = useState(0);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const showInitialLoading = loading && customers.length === 0;
  const fetchRequestIdRef = useRef(0);

  // Form state for creating customer
  const [newCustomer, setNewCustomer] = useState<CustomerCreate>({
    phone: "",
    customer_id: "",
    name: "",
    email: "",
    address: "",
    opening_balance: 0,
  });


  useEffect(() => {
    // Wait for auth to finish loading before checking token
    if (isLoading) return;

    if (!token) {
      router.push("/login");
      return;
    }
    fetchCustomers();
  }, [token, isLoading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, page]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const fetchCustomers = async () => {
    const requestId = ++fetchRequestIdRef.current;
    try {
      setLoading(true);
      const [customersRes, countRes] = await Promise.all([
        customerApi.getCustomers({
          skip: (page - 1) * pageSize,
          limit: pageSize,
          search: searchQuery || undefined,
        }),
        customerApi.countCustomers({ search: searchQuery || undefined }),
      ]);

      if (requestId !== fetchRequestIdRef.current) {
        return;
      }
      setCustomers(customersRes);
      setTotalCount(countRes.total || 0);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSendAllReminders = async () => {
    try {
      setSendingReminders(true);
      const result = await customerApi.sendAllDueReminders();
      alert(`Reminders queued: ${result.sent} (Skipped: ${result.skipped})`);
    } catch (error: any) {
      console.error("Failed to send reminders:", error);
      alert(error?.response?.data?.detail || "Failed to send reminders");
    } finally {
      setSendingReminders(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.phone && !newCustomer.customer_id) {
      alert("Please provide either phone number or customer ID");
      return;
    }

    if ((newCustomer.opening_balance ?? 0) < 0) {
      alert("Opening balance must be greater than or equal to 0");
      return;
    }

    setCreating(true);
    try {
      await customerApi.createCustomer(newCustomer);
      setCreateDialogOpen(false);
      setNewCustomer({
        phone: "",
        customer_id: "",
        name: "",
        email: "",
        address: "",
        opening_balance: 0,
      });

      fetchCustomers();
    } catch (error: any) {
      console.error("Failed to create customer:", error);
      alert(error.response?.data?.detail || "Failed to create customer");
    } finally {
      setCreating(false);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkFile) {
      alert("Please select a CSV file");
      return;
    }

    const formData = new FormData();
    formData.append("file", bulkFile);

    setBulkUploading(true);
    try {
      const result = await customerApi.bulkImportCustomers(formData);
      setBulkResult(result);
      fetchCustomers();
    } catch (error: any) {
      console.error("Failed to import customers:", error);
      alert(error.response?.data?.detail || "Failed to import customers");
    } finally {
      setBulkUploading(false);
    }
  };

  const handleViewCustomer = (customerId: number) => {
    if (!customerId || isNaN(customerId)) {
      console.error("Invalid customer ID:", customerId);
      return;
    }
    router.push(`/customers/${customerId}`);
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

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (showInitialLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Customers</h1>
          <p className="text-muted-foreground">
            Manage customer information and purchase history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSendAllReminders}
            disabled={sendingReminders}
          >
            <DollarSign className="h-4 w-4 mr-2" />
            {sendingReminders ? "Sending..." : "Send Due Reminders"}
          </Button>
          <Dialog open={bulkDialogOpen} onOpenChange={(open) => {
            setBulkDialogOpen(open);
            if (!open) {
              setBulkFile(null);
              setBulkResult(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Bulk Import (CSV)
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bulk Import Customers</DialogTitle>
                <DialogDescription>
                  Upload a CSV file with columns: phone, customer_id, name, email, address, opening_balance
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="customers_csv">CSV File</Label>
                  <Input
                    id="customers_csv"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  />
                    <p className="text-xs text-muted-foreground">
                      Opening balance must be rs &gt;= 0.
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
                <Button
                  variant="outline"
                  onClick={() => setBulkDialogOpen(false)}
                  disabled={bulkUploading}
                >
                  Close
                </Button>
                <Button onClick={handleBulkImport} disabled={bulkUploading || !bulkFile}>
                  {bulkUploading ? "Importing..." : "Import Customers"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
              <DialogDescription>
                Create a new customer record. At least phone or customer ID is required.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="03171585452"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer_id">Customer ID (Optional)</Label>
                  <Input
                    id="customer_id"
                    placeholder="CUST001"
                    value={newCustomer.customer_id}
                    onChange={(e) => setNewCustomer({ ...newCustomer, customer_id: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email (Optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address (Optional)</Label>
                  <Input
                    id="address"
                    placeholder="123 Main St, City"
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="opening_balance">Opening Balance (Legacy Udhar)</Label>
                <Input
                  id="opening_balance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newCustomer.opening_balance ?? 0}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      opening_balance: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Enter existing credit from manual system
                </p>
              </div>

            </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateCustomer} disabled={creating}>
                  {creating ? "Creating..." : "Create Customer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers by name, phone, ID, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            {loading && (
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Customer List ({totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "No customers found matching your search." : "No customers yet."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  {/* <TableHead>Purchases</TableHead> */}
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Member Since</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => {
                  // Ensure customer has valid ID before rendering
                  if (!customer?.id) {
                    console.error("Customer missing ID:", customer);
                    return null;
                  }
                  
                  return (
                    <TableRow key={customer.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {customer.name || "Unnamed Customer"}
                          </p>
                          {customer.customer_id && (
                            <p className="text-sm text-muted-foreground">
                              ID: {customer.customer_id}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {customer.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      {/* <TableCell>
                        <Badge variant="secondary">
                          {customer.total_purchases} sales
                        </Badge>
                      </TableCell> */}
                      <TableCell className="font-medium">
                        {formatCurrency(customer.total_spent)}
                      </TableCell>
                      <TableCell>
                        {customer.outstanding_balance > 0 ? (
                          <Badge variant="destructive">
                            {formatCurrency(customer.outstanding_balance)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(customer.created_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewCustomer(customer.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount === 0
            ? "Showing 0 of 0"
            : `Showing ${(page - 1) * pageSize + 1}-${(page - 1) * pageSize + customers.length} of ${totalCount}`}
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
    </div >
  );
}
