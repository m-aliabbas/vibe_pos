"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import {
  Receipt,
  Search,
  Calendar,
  DollarSign,
  User,
  Package,
  CreditCard,
  FileText,
  Filter,
} from "lucide-react";

interface SaleItem {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Sale {
  id: number;
  user_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  change_amount: number;
  created_at: string;
  items: SaleItem[];
}

interface Product {
  id: number;
  name: string;
  sku: string;
}

export default function SalesHistory() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<{ [key: number]: Product }>({});
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  // Calculate revenue by payment method
  const getRevenueByPaymentMethod = () => {
    const breakdown = {
      cash: 0,
      card: 0,
      mobile: 0,
      other: 0,
    };
    sales.forEach((sale) => {
      const method = sale.payment_method.toLowerCase();
      if (method in breakdown) {
        breakdown[method as keyof typeof breakdown] += sale.total;
      }
    });
    return breakdown;
  };

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchSales();
    fetchProducts();
  }, [token]);

  useEffect(() => {
    if (!searchQuery.trim() && paymentMethodFilter === 'all' && dateFilter === 'all') {
      setFilteredSales(sales);
      return;
    }

    let filtered = sales;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (sale) =>
          sale.id.toString().includes(query) ||
          sale.customer_name?.toLowerCase().includes(query) ||
          sale.customer_phone?.includes(query.replace(/\D/g, '')) ||
          sale.payment_method.toLowerCase().includes(query) ||
          new Date(sale.created_at).toLocaleDateString().includes(query)
      );
    }
    
    // Apply payment method filter
    if (paymentMethodFilter !== 'all') {
      filtered = filtered.filter(sale => sale.payment_method.toLowerCase() === paymentMethodFilter);
    }
    
    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(sale => {
        const saleDate = new Date(sale.created_at);
        const saleDateOnly = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate());
        
        if (dateFilter === 'today') {
          return saleDateOnly.getTime() === today.getTime();
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return saleDateOnly >= weekAgo;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return saleDateOnly >= monthAgo;
        }
        return true;
      });
    }
    
    setFilteredSales(filtered);
  }, [searchQuery, sales, paymentMethodFilter, dateFilter]);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const response = await api.get("/sales/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSales(response.data);
      setFilteredSales(response.data);
    } catch (error) {
      console.error("Failed to fetch sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get("/products/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const productMap: { [key: number]: Product } = {};
      response.data.forEach((product: Product) => {
        productMap[product.id] = product;
      });
      setProducts(productMap);
    } catch (error) {
      console.error("Failed to fetch products:", error);
    }
  };

  const viewSaleDetails = async (saleId: number) => {
    try {
      const response = await api.get(`/sales/${saleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedSale(response.data);
      setDetailsOpen(true);
    } catch (error) {
      console.error("Failed to fetch sale details:", error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPaymentMethodBadge = (method: string) => {
    const colors: { [key: string]: string } = {
      cash: "bg-green-100 text-green-800",
      card: "bg-blue-100 text-blue-800",
      mobile: "bg-purple-100 text-purple-800",
      other: "bg-gray-100 text-gray-800",
    };
    return colors[method] || colors.other;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sales History</h1>
          <p className="text-muted-foreground">
            View all completed transactions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="px-4 py-3">
          <p className="text-sm text-muted-foreground">Total Sales</p>
          <p className="text-2xl font-bold">{sales.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-sm text-muted-foreground">Total Revenue</p>
          <p className="text-2xl font-bold text-primary">
            ₹{sales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2)}
          </p>
        </Card>
        {(() => {
          const breakdown = getRevenueByPaymentMethod();
          return (
            <>
              <Card className="px-4 py-3 bg-green-50">
                <p className="text-sm text-green-700">Cash</p>
                <p className="text-xl font-bold text-green-800">
                  ₹{breakdown.cash.toFixed(2)}
                </p>
              </Card>
              <Card className="px-4 py-3 bg-blue-50">
                <p className="text-sm text-blue-700">Card</p>
                <p className="text-xl font-bold text-blue-800">
                  ₹{breakdown.card.toFixed(2)}
                </p>
              </Card>
              <Card className="px-4 py-3 bg-purple-50">
                <p className="text-sm text-purple-700">Mobile</p>
                <p className="text-xl font-bold text-purple-800">
                  ₹{breakdown.mobile.toFixed(2)}
                </p>
              </Card>
            </>
          );
        })()}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by sale ID, customer name, phone, payment method..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <CreditCard className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Payment Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            All Sales
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading sales...</div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No sales found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale ID</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((sale) => (
                    <TableRow
                      key={sale.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => viewSaleDetails(sale.id)}
                    >
                      <TableCell className="font-semibold">#{sale.id}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {formatDate(sale.created_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {sale.customer_name || "Walk-in"}
                          </div>
                          {sale.customer_phone && (
                            <div className="text-xs text-muted-foreground mt-1">
                              📱 {sale.customer_phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {sale.items.length} items
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPaymentMethodBadge(sale.payment_method)}>
                          {sale.payment_method.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        ₹{sale.total.toFixed(2)}
                        {sale.amount_due > 0 && (
                          <Badge variant="destructive" className="ml-2">
                            Udhar: ₹{sale.amount_due.toFixed(2)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-2 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewSaleDetails(sale.id);
                            }}
                          >
                            View Details
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/sales/invoice/${sale.id}`);
                            }}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Invoice
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sale Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Sale Details - #{selectedSale?.id}
            </DialogTitle>
            <DialogDescription>
              {selectedSale && formatDate(selectedSale.created_at)}
            </DialogDescription>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-6">
              {/* Sale Info */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Customer</span>
                    </div>
                    <p className="text-lg">{selectedSale.customer_name || "Walk-in"}</p>
                    {selectedSale.customer_phone && (
                      <p className="text-sm text-muted-foreground mt-1">
                        📱 {selectedSale.customer_phone}
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Payment Method</span>
                    </div>
                    <Badge className={getPaymentMethodBadge(selectedSale.payment_method)}>
                      {selectedSale.payment_method.toUpperCase()}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              {/* Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="h-4 w-4" />
                    Items ({selectedSale.items.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSale.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {products[item.product_id]?.name || "Unknown Product"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                SKU: {products[item.product_id]?.sku || "N/A"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            ₹{item.unit_price.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{item.quantity}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            ₹{item.total_price.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Totals */}
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>₹{selectedSale.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedSale.discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount:</span>
                      <span>-₹{selectedSale.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedSale.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Tax:</span>
                      <span>+₹{selectedSale.tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary">
                      ₹{selectedSale.total.toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t pt-2 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Amount Paid:</span>
                      <span className="font-semibold text-green-600">
                        ₹{selectedSale.amount_paid.toFixed(2)}
                      </span>
                    </div>
                    {selectedSale.amount_due > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-red-600">Amount Due (Udhar):</span>
                        <span className="font-bold text-red-600">
                          ₹{selectedSale.amount_due.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {selectedSale.change_amount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-blue-600">Change Returned:</span>
                        <span className="font-semibold text-blue-600">
                          ₹{selectedSale.change_amount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Dialog Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => router.push(`/sales/invoice/${selectedSale.id}`)}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Invoice
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
