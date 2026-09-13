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
import { formatPakistanDateTime } from "@/lib/utils";
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
  Pencil,
} from "lucide-react";

interface SaleItem {
  id: number;
  product_id: number;
  variation_id?: number | null;
  unit?: string;
  item_discount?: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_name?: string;
  variation_attributes?: Record<string, string>;
}

interface ReturnItem {
  id: number;
  sale_item_id?: number | null;
  product_id: number;
  quantity: number;
  unit: string;
  total_refund?: number | null;
  restocked?: boolean | null;
}

interface ReturnRecord {
  id: number;
  sale_id?: number | null;
  refund_amount: number;
  created_at: string;
  items: ReturnItem[];
}

interface Sale {
  id: number;
  user_id: number;
  customer_ref_id?: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: string;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_charges?: number;
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
  const [selectedSaleReturns, setSelectedSaleReturns] = useState<ReturnRecord[]>([]);
  const [returnedBySaleItem, setReturnedBySaleItem] = useState<{ [key: number]: number }>({});
  const [returnRefundTotal, setReturnRefundTotal] = useState(0);
  const [returnsBySaleId, setReturnsBySaleId] = useState<{ [key: number]: number }>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [editCustPhone, setEditCustPhone] = useState("");
  const [editCustResults, setEditCustResults] = useState<{ id: number; name: string; phone: string | null; customer_id: string | null }[]>([]);
  const [editCustSearching, setEditCustSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;
  const SALES_FETCH_PAGE_SIZE = 500;

  // Calculate revenue by payment method for the currently visible data set
  const getRevenueByPaymentMethod = (salesData: Sale[]) => {
    const breakdown = {
      cash: 0,
      card: 0,
      mobile: 0,
      other: 0,
    };
    salesData.forEach((sale) => {
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
    setCurrentPage(1);
  }, [searchQuery, sales, paymentMethodFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
  const paginatedSales = filteredSales.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const allSales: Sale[] = [];
      let skip = 0;

      while (true) {
        const response = await api.get("/sales/", {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            skip,
            limit: SALES_FETCH_PAGE_SIZE,
          },
        });

        const pageData: Sale[] = response.data || [];
        if (pageData.length === 0) {
          break;
        }

        allSales.push(...pageData);

        if (pageData.length < SALES_FETCH_PAGE_SIZE) {
          break;
        }

        skip += SALES_FETCH_PAGE_SIZE;
      }

      setSales(allSales);
      setFilteredSales(allSales);

      const returnsRes = await api.get("/returns/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 5000 },
      });
      const returnsData: ReturnRecord[] = returnsRes.data || [];
      const saleReturnCounts: { [key: number]: number } = {};
      returnsData.forEach((ret) => {
        if (ret.sale_id) {
          saleReturnCounts[ret.sale_id] = (saleReturnCounts[ret.sale_id] || 0) + 1;
        }
      });
      setReturnsBySaleId(saleReturnCounts);
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
      const returnsRes = await api.get("/returns/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { sale_id: saleId },
      });
      const returnsData: ReturnRecord[] = returnsRes.data || [];
      setSelectedSaleReturns(returnsData);

      const returnedMap: { [key: number]: number } = {};
      let refundTotal = 0;
      returnsData.forEach((ret) => {
        refundTotal += ret.refund_amount || 0;
        ret.items.forEach((item) => {
          if (item.sale_item_id) {
            returnedMap[item.sale_item_id] =
              (returnedMap[item.sale_item_id] || 0) + (item.quantity || 0);
          }
        });
      });
      setReturnedBySaleItem(returnedMap);
      setReturnRefundTotal(refundTotal);

      setDetailsOpen(true);
    } catch (error) {
      console.error("Failed to fetch sale details:", error);
    }
  };

  const openEditSale = async (saleId: number) => {
    try {
      const response = await api.get(`/sales/${saleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEditSale(response.data);
      setEditCustPhone("");
      setEditCustResults([]);
      setEditOpen(true);
    } catch (error) {
      console.error("Failed to fetch sale for edit:", error);
      alert("Failed to load sale for editing");
    }
  };

  const searchCustomerForEdit = async () => {
    const q = editCustPhone.trim();
    if (!q) return;
    try {
      setEditCustSearching(true);
      setEditCustResults([]);
      const res = await api.get("/customers/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: q, limit: 20 },
      });
      setEditCustResults(res.data || []);
    } catch {
      setEditCustResults([]);
    } finally {
      setEditCustSearching(false);
    }
  };

  const assignCustomerToEdit = (c: { id: number; name: string; phone: string | null; customer_id: string | null }) => {
    if (!editSale) return;
    setEditSale({
      ...editSale,
      customer_ref_id: c.id,
      customer_name: c.name,
      customer_phone: c.phone || "",
    });
    setEditCustResults([]);
    setEditCustPhone("");
  };

  const updateEditItem = (index: number, field: "quantity" | "unit_price" | "item_discount", value: string) => {
    if (!editSale) return;
    const next = { ...editSale };
    const parsed = parseFloat(value);
    if (field === "quantity") {
      next.items[index] = {
        ...next.items[index],
        quantity: Math.max(1, Math.floor(Number.isFinite(parsed) ? parsed : 1)),
      };
    } else if (field === "unit_price") {
      next.items[index] = {
        ...next.items[index],
        unit_price: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
      };
    } else {
      next.items[index] = {
        ...next.items[index],
        item_discount: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
      };
    }
    setEditSale(next);
  };

  const saveEditedSale = async () => {
    if (!editSale) return;
    try {
      setSavingEdit(true);
      await api.put(
        `/sales/${editSale.id}`,
        {
          customer_ref_id: editSale.customer_ref_id || null,
          customer_name: editSale.customer_name,
          customer_phone: editSale.customer_phone,
          payment_method: editSale.payment_method,
          discount: editSale.discount || 0,
          tax: editSale.tax || 0,
          delivery_charges: editSale.delivery_charges || 0,
          amount_paid: editSale.amount_paid,
          items: editSale.items.map((item) => ({
            product_id: item.product_id,
            variation_id: item.variation_id || null,
            unit: item.unit || "piece",
            quantity: item.quantity,
            unit_price: item.unit_price,
            item_discount: item.item_discount || 0,
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setEditOpen(false);
      setEditSale(null);
      await fetchSales();
      if (selectedSale?.id === editSale.id) {
        await viewSaleDetails(editSale.id);
      }
      alert("Sale updated successfully");
    } catch (error: any) {
      console.error("Failed to update sale:", error);
      alert(error?.response?.data?.detail || "Failed to update sale");
    } finally {
      setSavingEdit(false);
    }
  };

  const formatDate = (dateString: string) => formatPakistanDateTime(dateString);

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
    <div className="p-6 h-full flex flex-col gap-6">
      {/* Header */}
      <div className="shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sales History</h1>
          <p className="text-muted-foreground">
            View all completed transactions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="shrink-0 grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="px-4 py-3">
          <p className="text-sm text-muted-foreground">Total Sales</p>
          <p className="text-2xl font-bold">{filteredSales.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-sm text-muted-foreground">Total Revenue</p>
          <p className="text-2xl font-bold text-primary">
            rs {filteredSales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2)}
          </p>
        </Card>
        {(() => {
          const breakdown = getRevenueByPaymentMethod(filteredSales);
          return (
            <>
              <Card className="px-4 py-3 bg-green-50">
                <p className="text-sm text-green-700">Cash</p>
                <p className="text-xl font-bold text-green-800">
                  rs {breakdown.cash.toFixed(2)}
                </p>
              </Card>
              <Card className="px-4 py-3 bg-blue-50">
                <p className="text-sm text-blue-700">Card</p>
                <p className="text-xl font-bold text-blue-800">
                  rs {breakdown.card.toFixed(2)}
                </p>
              </Card>
              <Card className="px-4 py-3 bg-purple-50">
                <p className="text-sm text-purple-700">Mobile</p>
                <p className="text-xl font-bold text-purple-800">
                  rs {breakdown.mobile.toFixed(2)}
                </p>
              </Card>
            </>
          );
        })()}
      </div>

      {/* Search and Filters */}
      <div className="shrink-0">
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
      </div>

      {/* Sales Table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {dateFilter === "today" ? "Today Sales" : "Sales History"}
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
                  {paginatedSales.map((sale) => (
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
                        {returnsBySaleId[sale.id] && (
                          <Badge variant="secondary" className="ml-2">
                            Returned: {returnsBySaleId[sale.id]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={getPaymentMethodBadge(sale.payment_method)}>
                          {sale.payment_method.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        rs {sale.total.toFixed(2)}
                        {sale.amount_due > 0 && (
                          <Badge variant="destructive" className="ml-2">
                            Udhar: rs {sale.amount_due.toFixed(2)}
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
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditSale(sale.id);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredSales.length)} of {filteredSales.length} sales
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      «
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      ‹
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                      .reduce<(number | string)[]>((acc, p, idx, arr) => {
                        if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, idx) =>
                        item === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
                        ) : (
                          <Button
                            key={item}
                            variant={currentPage === item ? 'default' : 'outline'}
                            size="sm"
                            className="w-9"
                            onClick={() => setCurrentPage(item as number)}
                          >
                            {item}
                          </Button>
                        )
                      )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      ›
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      »
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

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
                        <TableHead className="text-center">Returned</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSale.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {item.product_name || products[item.product_id]?.name || "Unknown Product"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                SKU: {products[item.product_id]?.sku || "N/A"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            rs {item.unit_price.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{item.quantity}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {returnedBySaleItem[item.id] || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            rs {item.total_price.toFixed(2)}
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
                    <span>rs {selectedSale.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedSale.discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount:</span>
                      <span>-rs {selectedSale.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedSale.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Tax:</span>
                      <span>+rs {selectedSale.tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary">
                      rs {selectedSale.total.toFixed(2)}
                    </span>
                  </div>
                  {selectedSaleReturns.length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Returns:</span>
                      <span>{selectedSaleReturns.length}</span>
                    </div>
                  )}
                  {returnRefundTotal > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>Returned (Refunded):</span>
                      <span>-rs {returnRefundTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {returnRefundTotal > 0 && (
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Net Total:</span>
                      <span>rs {(selectedSale.total - returnRefundTotal).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Amount Paid:</span>
                      <span className="font-semibold text-green-600">
                        rs {selectedSale.amount_paid.toFixed(2)}
                      </span>
                    </div>
                    {selectedSale.amount_due > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-red-600">Amount Due (Udhar):</span>
                        <span className="font-bold text-red-600">
                          rs {selectedSale.amount_due.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {selectedSale.change_amount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-blue-600">Change Returned:</span>
                        <span className="font-semibold text-blue-600">
                          rs {selectedSale.change_amount.toFixed(2)}
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
                <Button variant="secondary" onClick={() => selectedSale && openEditSale(selectedSale.id)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Sale
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Sale #{editSale?.id}</DialogTitle>
            <DialogDescription>
              Editing a sale updates inventory, accounting, and customer balances automatically.
            </DialogDescription>
          </DialogHeader>

          {editSale && (
            <div className="space-y-4">
              {/* Customer section */}
              <div className="border rounded-lg p-3 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" /> Customer
                </p>

                {/* Current customer */}
                {editSale.customer_name || editSale.customer_phone ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold text-green-800">{editSale.customer_name || "—"}</p>
                      <p className="text-xs text-green-600">
                        {editSale.customer_phone && `Phone: ${editSale.customer_phone}`}
                        {editSale.customer_ref_id && ` • ID: ${editSale.customer_ref_id}`}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 h-7 text-xs"
                      onClick={() => setEditSale({ ...editSale, customer_ref_id: null, customer_name: null, customer_phone: null })}>
                      Clear
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No customer assigned</p>
                )}

                {/* Search by phone */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by phone or name..."
                    value={editCustPhone}
                    className="h-8 text-sm"
                    onChange={(e) => setEditCustPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void searchCustomerForEdit()}
                  />
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void searchCustomerForEdit()} disabled={editCustSearching}>
                    <Search className="h-3.5 w-3.5 mr-1" />{editCustSearching ? "..." : "Search"}
                  </Button>
                </div>

                {/* Results */}
                {editCustResults.length > 0 && (
                  <div className="border rounded divide-y max-h-40 overflow-y-auto">
                    {editCustResults.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/40 cursor-pointer text-sm"
                        onClick={() => assignCustomerToEdit(c)}>
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.phone && `Phone: ${c.phone}`}{c.customer_id && ` • ${c.customer_id}`}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">Assign</Button>
                      </div>
                    ))}
                  </div>
                )}
                {editCustResults.length === 0 && editCustPhone && !editCustSearching && (
                  <p className="text-xs text-muted-foreground">No customers found. You can still type a name/phone manually below.</p>
                )}

                {/* Manual override */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Name (manual)</label>
                    <Input className="h-8 text-sm" value={editSale.customer_name || ""} onChange={(e) => setEditSale({ ...editSale, customer_name: e.target.value || null, customer_ref_id: null })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Phone (manual)</label>
                    <Input className="h-8 text-sm" value={editSale.customer_phone || ""} onChange={(e) => setEditSale({ ...editSale, customer_phone: e.target.value || null, customer_ref_id: null })} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Payment</label>
                  <Select
                    value={editSale.payment_method}
                    onValueChange={(value) => setEditSale({ ...editSale, payment_method: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="mobile">Mobile</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Discount</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editSale.discount}
                    onChange={(e) => setEditSale({ ...editSale, discount: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tax</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editSale.tax}
                    onChange={(e) => setEditSale({ ...editSale, tax: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Delivery</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editSale.delivery_charges || 0}
                    onChange={(e) => setEditSale({ ...editSale, delivery_charges: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount Paid</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editSale.amount_paid}
                    onChange={(e) => setEditSale({ ...editSale, amount_paid: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sale Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {editSale.items.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <p className="text-sm font-medium">{item.product_name || products[item.product_id]?.name || `Product #${item.product_id}`}</p>
                        <p className="text-xs text-muted-foreground">Unit: {item.unit || "piece"}</p>
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs">Qty</label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateEditItem(index, "quantity", e.target.value)}
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs">Unit Price</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateEditItem(index, "unit_price", e.target.value)}
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs">Item Discount</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.item_discount || 0}
                          onChange={(e) => updateEditItem(index, "item_discount", e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Totals summary */}
              {(() => {
                const subtotal = editSale.items.reduce((s, i) => s + i.unit_price * i.quantity - (i.item_discount || 0), 0);
                const grandTotal = subtotal - (editSale.discount || 0) + (editSale.tax || 0) + (editSale.delivery_charges || 0);
                const due = grandTotal - (editSale.amount_paid || 0);
                return (
                  <div className="border rounded-lg p-3 bg-muted/30 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Sub Total</p>
                      <p className="font-semibold">rs {subtotal.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Discount / Tax / Delivery</p>
                      <p className="font-semibold text-red-600">
                        -{(editSale.discount || 0).toFixed(2)} / +{(editSale.tax || 0).toFixed(2)} / +{(editSale.delivery_charges || 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Grand Total</p>
                      <p className="font-bold text-primary text-base">rs {grandTotal.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Amount Due</p>
                      <p className={`font-bold text-base ${due > 0 ? "text-red-600" : "text-green-600"}`}>
                        rs {due.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button onClick={saveEditedSale} disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
