"use client";

import { useState, useEffect } from "react";
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
  const { user, token } = useAuthStore();
  const [customers, setCustomers] = useState<CustomerListResponse[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerListResponse[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state for creating customer
  const [newCustomer, setNewCustomer] = useState<CustomerCreate>({
    phone: "",
    customer_id: "",
    name: "",
    email: "",
    address: "",
    current_mileage: undefined,
    oil_change_interval: undefined,
    next_oil_change_mileage: undefined,
  });
  const [showVehicleInfo, setShowVehicleInfo] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchCustomers();
  }, [token]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCustomers(customers);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = customers.filter(
      (customer) =>
        customer.name?.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query) ||
        customer.customer_id?.toLowerCase().includes(query)
    );
    setFilteredCustomers(filtered);
  }, [searchQuery, customers]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await customerApi.getCustomers();
      setCustomers(response);
      setFilteredCustomers(response);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.phone && !newCustomer.customer_id) {
      alert("Please provide either phone number or customer ID");
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
        current_mileage: undefined,
        oil_change_interval: undefined,
        next_oil_change_mileage: undefined,
      });
      setShowVehicleInfo(false);
      fetchCustomers();
    } catch (error: any) {
      console.error("Failed to create customer:", error);
      alert(error.response?.data?.detail || "Failed to create customer");
    } finally {
      setCreating(false);
    }
  };

  const handleViewCustomer = (customerId: number) => {
    router.push(`/customers/${customerId}`);
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

  if (loading) {
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
              
              {/* Vehicle Info Section */}
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="vehicle-info"
                    checked={showVehicleInfo}
                    onChange={(e) => setShowVehicleInfo(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <Label htmlFor="vehicle-info" className="mb-0 cursor-pointer">
                    Add Vehicle Information (Oil Change Tracking)
                  </Label>
                </div>
              </div>
              
              {showVehicleInfo && (
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg space-y-4">
                  <h3 className="font-semibold text-sm">Vehicle Oil Change Details</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="current_mileage">Current Mileage (km)</Label>
                      <Input
                        id="current_mileage"
                        type="number"
                        placeholder="e.g., 441221"
                        value={newCustomer.current_mileage || ""}
                        onChange={(e) => {
                          const mileage = e.target.value ? parseInt(e.target.value) : undefined;
                          const nextMileage = mileage && newCustomer.oil_change_interval
                            ? mileage + newCustomer.oil_change_interval
                            : undefined;
                          setNewCustomer({ 
                            ...newCustomer, 
                            current_mileage: mileage,
                            next_oil_change_mileage: nextMileage
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="oil_change_interval">Oil Change Interval (km)</Label>
                      <Input
                        id="oil_change_interval"
                        type="number"
                        placeholder="e.g., 3000"
                        value={newCustomer.oil_change_interval || ""}
                        onChange={(e) => {
                          const interval = e.target.value ? parseInt(e.target.value) : undefined;
                          const nextMileage = newCustomer.current_mileage && interval 
                            ? newCustomer.current_mileage + interval 
                            : undefined;
                          setNewCustomer({ 
                            ...newCustomer, 
                            oil_change_interval: interval,
                            next_oil_change_mileage: nextMileage
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="next_oil_change_mileage">Next Oil Change (km)</Label>
                      <Input
                        id="next_oil_change_mileage"
                        type="number"
                        placeholder="e.g., 444221"
                        value={newCustomer.next_oil_change_mileage || ""}
                        readOnly
                        className="bg-gray-100"
                        onChange={(e) => setNewCustomer({ 
                          ...newCustomer, 
                          next_oil_change_mileage: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                      />
                    </div>
                  </div>
                </div>
              )}
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
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Customer List ({filteredCustomers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCustomers.length === 0 ? (
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
                {filteredCustomers.map((customer) => (
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
