"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {ProtectedRoute} from "@/components/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Search, Package, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { formatPakistanDateTime } from "@/lib/utils";

interface SaleItem {
  id: number;
  product_id: number;
  product_name?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  variation_attributes?: Record<string, string> | null;
}

interface Sale {
  id: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at: string;
  total: number;
  items: SaleItem[];
}

interface ReturnLine {
  sale_item: SaleItem;
  quantity: number;
  restocked: boolean;
  selected: boolean;
  remaining: number;
  returned: number;
}

export default function CreateReturnPage() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [saleSearch, setSaleSearch] = useState("");
  const [saleResults, setSaleResults] = useState<Sale[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [returnedBySaleItem, setReturnedBySaleItem] = useState<{ [key: number]: number }>({});
  const saleSearchRequestIdRef = useRef(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [returnReason, setReturnReason] = useState("defective");
  const [settlementMode, setSettlementMode] = useState("auto");
  const [returnNotes, setReturnNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!saleSearch.trim()) {
      setSaleResults([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchSales(saleSearch.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [saleSearch, token]);

  const fetchSales = async (searchTerm: string) => {
    const requestId = ++saleSearchRequestIdRef.current;
    try {
      setSaleLoading(true);
      const response = await api.get("/sales/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: searchTerm, limit: 20 },
      });
      if (requestId !== saleSearchRequestIdRef.current) {
        return;
      }
      setSaleResults(response.data);
    } catch (error) {
      console.error("Failed to fetch sales:", error);
    } finally {
      if (requestId === saleSearchRequestIdRef.current) {
        setSaleLoading(false);
      }
    }
  };

  const selectSale = async (saleId: number) => {
    try {
      const response = await api.get(`/sales/${saleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const returnsRes = await api.get("/returns/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { sale_id: saleId },
      });
      const returnsData = returnsRes.data || [];
      const returnedMap: { [key: number]: number } = {};
      returnsData.forEach((ret: any) => {
        (ret.items || []).forEach((item: any) => {
          if (item.sale_item_id) {
            returnedMap[item.sale_item_id] =
              (returnedMap[item.sale_item_id] || 0) + (item.quantity || 0);
          }
        });
      });
      setReturnedBySaleItem(returnedMap);

      const sale: Sale = response.data;
      setSelectedSale(sale);
      setCustomerName(sale.customer_name || "");
      setCustomerPhone(sale.customer_phone || "");
      setReturnLines(
        (sale.items || []).map((item) => ({
          returned: returnedMap[item.id] || 0,
          remaining: Math.max(0, item.quantity - (returnedMap[item.id] || 0)),
          sale_item: item,
          quantity: Math.max(1, Math.min(item.quantity, Math.max(0, item.quantity - (returnedMap[item.id] || 0)))),
          restocked: true,
          selected: false,
        }))
      );
    } catch (error) {
      console.error("Failed to fetch sale:", error);
    }
  };

  const toggleLineSelected = (saleItemId: number) => {
    setReturnLines((prev) =>
      prev.map((line) =>
        line.sale_item.id === saleItemId
          ? (line.remaining > 0 ? { ...line, selected: !line.selected } : line)
          : line
      )
    );
  };

  const updateReturnQuantity = (saleItemId: number, quantity: number) => {
    setReturnLines((prev) =>
      prev.map((line) => {
        if (line.sale_item.id !== saleItemId) return line;
        const maxQty = line.remaining;
        const nextQty = Math.max(1, Math.min(maxQty, quantity));
        return { ...line, quantity: nextQty };
      })
    );
  };

  const toggleRestocked = (saleItemId: number) => {
    setReturnLines((prev) =>
      prev.map((line) =>
        line.sale_item.id === saleItemId
          ? { ...line, restocked: !line.restocked }
          : line
      )
    );
  };

  const processReturn = async () => {
    if (!selectedSale) {
      alert("Please select a sale/invoice");
      return;
    }

    const selectedLines = returnLines.filter((line) => line.selected && line.remaining > 0 && line.quantity > 0);
    if (selectedLines.length === 0) {
      alert("Please select at least one item to return");
      return;
    }

    setProcessing(true);
    try {
      await api.post(
        "/returns/",
        {
          sale_id: selectedSale.id,
          customer_name: customerName || selectedSale.customer_name || null,
          customer_phone: customerPhone || selectedSale.customer_phone || null,
          reason: returnReason,
          settlement_mode: settlementMode,
          notes: returnNotes || null,
          items: selectedLines.map((line) => ({
            sale_item_id: line.sale_item.id,
            quantity_returned: line.quantity,
            restocked: line.restocked,
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      alert("Return processed successfully!");
      router.push("/returns");
    } catch (error: any) {
      console.error("Failed to process return:", error);
      alert(error.response?.data?.detail || "Failed to process return");
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <ProtectedRoute>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/returns")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <RotateCcw className="h-8 w-8" />
              Process Return
            </h1>
            <p className="text-muted-foreground">Select a sale/invoice and return items</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side - Sale Search & Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Search Sale / Invoice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice/sale id, customer name, or phone..."
                  value={saleSearch}
                  onChange={(e) => setSaleSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
                {saleLoading && (
                  <div className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-b-2 border-primary" />
                )}

                {saleResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-80 overflow-y-auto">
                    {saleResults.map((sale) => (
                      <div
                        key={sale.id}
                        className="p-3 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => {
                          setSaleResults([]);
                          setSaleSearch(String(sale.id));
                          selectSale(sale.id);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium">Invoice #{sale.id}</p>
                            <p className="text-sm text-muted-foreground">
                              {sale.customer_name || "Walk-in"}
                              {sale.customer_phone ? ` • ${sale.customer_phone}` : ""}
                            </p>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <div>{formatPakistanDateTime(sale.created_at)}</div>
                            <div className="font-semibold">rs {sale.total.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedSale ? (
                <div className="border rounded-lg p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Selected Invoice #{selectedSale.id}</p>
                      <p className="text-muted-foreground">
                        {selectedSale.customer_name || "Walk-in"}
                        {selectedSale.customer_phone ? ` • ${selectedSale.customer_phone}` : ""}
                      </p>
                    </div>
                    <div className="font-semibold">rs {selectedSale.total.toFixed(2)}</div>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No sale selected</p>
                  <p className="text-sm">Search and select an invoice to continue</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Side - Return Details */}
          <Card>
            <CardHeader>
              <CardTitle>Return Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedSale && (
                <div className="space-y-3">
                  <Label>Items to Return</Label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {returnLines.map((line) => (
                      <div
                        key={line.sale_item.id}
                        className="border rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={line.selected}
                              onChange={() => toggleLineSelected(line.sale_item.id)}
                              className="mt-1"
                              disabled={line.remaining === 0}
                            />
                            <div>
                              <p className="font-medium">
                                {line.sale_item.product_name || `Product #${line.sale_item.product_id}`}
                              </p>
                              {line.sale_item.variation_attributes && (
                                <p className="text-xs text-muted-foreground">
                                  {Object.entries(line.sale_item.variation_attributes)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(", ")}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Sold: {line.sale_item.quantity} {line.sale_item.unit} • rs {line.sale_item.unit_price.toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Returned: {line.returned} • Remaining: {line.remaining}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              max={line.remaining}
                              value={line.quantity}
                              onChange={(e) =>
                                updateReturnQuantity(
                                  line.sale_item.id,
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className="h-9 w-20"
                              disabled={line.remaining === 0 || !line.selected}
                            />
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={line.restocked}
                                onChange={() => toggleRestocked(line.sale_item.id)}
                                disabled={line.remaining === 0 || !line.selected}
                              />
                              Restock
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Info */}
              <div className="space-y-2">
                <Label>Customer Name (Optional)</Label>
                <Input
                  placeholder="Enter customer name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Customer Phone (Optional)</Label>
                <Input
                  placeholder="Enter phone number"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>

              {/* Return Reason */}
              <div className="space-y-2">
                <Label>Return Reason *</Label>
                <Select value={returnReason} onValueChange={setReturnReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="defective">Defective Product</SelectItem>
                    <SelectItem value="wrong_item">Wrong Item</SelectItem>
                    <SelectItem value="customer_changed_mind">
                      Customer Changed Mind
                    </SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Settlement Mode */}
              <div className="space-y-2">
                <Label>Return Settlement *</Label>
                <Select value={settlementMode} onValueChange={setSettlementMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Adjust due first, rest cash)</SelectItem>
                    <SelectItem value="paid_to_customer">Paid to Customer (Cash)</SelectItem>
                    <SelectItem value="added_to_account">Added to Account (Prepaid Credit)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  "Added to Account" credits the customer ledger (can become prepaid). "Paid to Customer" gives full cash refund.
                </p>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any additional notes..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Summary */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Items:</span>
                  <span className="font-semibold">
                    {returnLines.filter((line) => line.selected).length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Quantity:</span>
                  <span className="font-semibold">
                    {returnLines
                      .filter((line) => line.selected)
                      .reduce((sum, line) => sum + line.quantity, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Adding to Stock:</span>
                  <span className="font-semibold">
                    {returnLines.filter((line) => line.selected && line.restocked).length} items
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push("/returns")}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={processReturn}
                  disabled={!selectedSale || returnLines.filter((line) => line.selected).length === 0 || processing}
                >
                  {processing ? "Processing..." : "Process Return"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
