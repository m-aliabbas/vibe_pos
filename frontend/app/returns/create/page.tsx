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
  purchase_item_id?: number;
  product_id: number;
  product_name?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  item_discount?: number;
  total_price: number;
  variation_id?: number | null;
  variation_attributes?: Record<string, string> | null;
}

interface Sale {
  id: number;
  source_type?: "sale" | "purchase";
  vendor_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at: string;
  total: number;
  items: SaleItem[];
}

interface PurchaseItemApi {
  id: number;
  product_id: number;
  product_name?: string | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  variation_id?: number | null;
}

interface PurchaseApi {
  id: number;
  vendor_id: number;
  created_at: string;
  total_amount: number;
  items: PurchaseItemApi[];
}

interface ReturnLine {
  sale_item: SaleItem;
  quantity: number;
  // Raw input text so partial decimals like "0." can be typed (e.g. 0.25 kg).
  quantityInput: string;
  restocked: boolean;
  selected: boolean;
  remaining: number;
  returned: number;
}

interface ReturnApiItem {
  sale_item_id?: number;
  purchase_item_id?: number;
  quantity?: number;
}

interface ReturnApiRecord {
  items?: ReturnApiItem[];
}

// Quantities are fractional for weighed goods; round away float noise (1 - 0.75).
const roundQty = (value: number) => Math.round(value * 10000) / 10000;

const defaultReturnQty = (soldQty: number, alreadyReturned: number) => {
  const remaining = roundQty(Math.max(0, soldQty - alreadyReturned));
  return Math.min(1, remaining);
};

const getLineAmounts = (line: ReturnLine) => {
  const qty = line.quantity || 0;
  const gross = (line.sale_item.unit_price || 0) * qty;
  const saleQty = line.sale_item.quantity || 0;
  const perUnitDiscount = saleQty > 0 ? (line.sale_item.item_discount || 0) / saleQty : 0;
  const discount = perUnitDiscount * qty;
  const refund = Math.max(0, gross - discount);
  return { gross, discount, refund };
};

export default function CreateReturnPage() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [returnType, setReturnType] = useState<"sale" | "purchase">("sale");
  const [saleSearch, setSaleSearch] = useState("");
  const [saleResults, setSaleResults] = useState<Sale[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [purchaseLookupLoading, setPurchaseLookupLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const saleSearchRequestIdRef = useRef(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [returnReason, setReturnReason] = useState("defective");
  const [settlementMode, setSettlementMode] = useState("auto");
  const [returnNotes, setReturnNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (returnType !== "sale") {
      setSaleResults([]);
      return;
    }

    if (!saleSearch.trim()) {
      setSaleResults([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchSales(saleSearch.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [saleSearch, token, returnType]);

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
      const returnsData: ReturnApiRecord[] = returnsRes.data || [];
      const returnedMap: { [key: number]: number } = {};
      returnsData.forEach((ret) => {
        (ret.items || []).forEach((item) => {
          if (item.sale_item_id) {
            returnedMap[item.sale_item_id] =
              (returnedMap[item.sale_item_id] || 0) + (item.quantity || 0);
          }
        });
      });
      const sale: Sale = response.data;
      setSelectedSale(sale);
      setCustomerName(sale.customer_name || "");
      setCustomerPhone(sale.customer_phone || "");
      setReturnLines(
        (sale.items || []).map((item) => ({
          returned: roundQty(returnedMap[item.id] || 0),
          remaining: roundQty(Math.max(0, item.quantity - (returnedMap[item.id] || 0))),
          sale_item: item,
          quantity: defaultReturnQty(item.quantity, returnedMap[item.id] || 0),
          quantityInput: String(defaultReturnQty(item.quantity, returnedMap[item.id] || 0)),
          restocked: true,
          selected: false,
        }))
      );
    } catch (error) {
      console.error("Failed to fetch sale:", error);
    }
  };

  const selectPurchase = async (purchaseId: number) => {
    try {
      setPurchaseLookupLoading(true);
      const purchaseRes = await api.get(`/purchases/${purchaseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const purchase: PurchaseApi = purchaseRes.data;

      const vendorRes = await api.get(`/vendors/${purchase.vendor_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const vendor = vendorRes.data;

      const returnsRes = await api.get("/returns/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { purchase_id: purchaseId },
      });
      const returnsData: ReturnApiRecord[] = returnsRes.data || [];
      const returnedMap: { [key: number]: number } = {};
      returnsData.forEach((ret) => {
        (ret.items || []).forEach((item) => {
          const lineId = item.purchase_item_id || item.sale_item_id;
          if (lineId) {
            returnedMap[lineId] = (returnedMap[lineId] || 0) + (item.quantity || 0);
          }
        });
      });
      const purchaseAsSale: Sale = {
        id: purchase.id,
        source_type: "purchase",
        vendor_id: purchase.vendor_id,
        customer_name: vendor?.name || null,
        customer_phone: vendor?.phone || null,
        created_at: purchase.created_at,
        total: purchase.total_amount || 0,
        items: (purchase.items || []).map((item) => ({
          id: item.id,
          purchase_item_id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: "unit",
          unit_price: item.unit_cost,
          item_discount: 0,
          total_price: item.total_cost,
          variation_id: item.variation_id ?? null,
          variation_attributes: null,
        })),
      };

      setSelectedSale(purchaseAsSale);
      setSaleSearch(String(purchase.id));
      setCustomerName(vendor?.name || "");
      setCustomerPhone(vendor?.phone || "");
      setReturnLines(
        (purchaseAsSale.items || []).map((item) => ({
          returned: roundQty(returnedMap[item.id] || 0),
          remaining: roundQty(Math.max(0, item.quantity - (returnedMap[item.id] || 0))),
          sale_item: item,
          quantity: defaultReturnQty(item.quantity, returnedMap[item.id] || 0),
          quantityInput: String(defaultReturnQty(item.quantity, returnedMap[item.id] || 0)),
          restocked: true,
          selected: false,
        }))
      );
    } catch (error) {
      console.error("Failed to fetch purchase:", error);
      alert("Failed to fetch purchase. Enter a valid purchase ID.");
    } finally {
      setPurchaseLookupLoading(false);
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

  const updateReturnQuantity = (saleItemId: number, rawValue: string) => {
    setReturnLines((prev) =>
      prev.map((line) => {
        if (line.sale_item.id !== saleItemId) return line;
        const parsed = Number.parseFloat(rawValue);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return { ...line, quantity: 0, quantityInput: rawValue };
        }
        if (parsed > line.remaining) {
          return { ...line, quantity: line.remaining, quantityInput: String(line.remaining) };
        }
        return { ...line, quantity: roundQty(parsed), quantityInput: rawValue };
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

    if (returnLines.some((line) => line.selected && line.remaining > 0 && !(line.quantity > 0))) {
      alert("Enter a return quantity greater than 0 for every selected item (e.g. 0.25)");
      return;
    }

    const selectedLines = returnLines.filter((line) => line.selected && line.remaining > 0 && line.quantity > 0);
    if (selectedLines.length === 0) {
      alert("Please select at least one item to return");
      return;
    }

    const isPurchaseReturn = selectedSale.source_type === "purchase";
    setProcessing(true);
    try {
      const payload = isPurchaseReturn
        ? {
            return_type: "purchase",
            purchase_id: selectedSale.id,
            customer_name: customerName || selectedSale.customer_name || null,
            customer_phone: customerPhone || selectedSale.customer_phone || null,
            reason: returnReason,
            settlement_mode: settlementMode,
            notes: returnNotes || null,
            items: selectedLines.map((line) => ({
              purchase_item_id: line.sale_item.purchase_item_id || line.sale_item.id,
              product_id: line.sale_item.product_id,
              quantity_returned: line.quantity,
              unit_cost: line.sale_item.unit_price,
              remove_from_inventory: line.restocked,
            })),
          }
        : {
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
          };

      await api.post(
        "/returns/",
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      alert("Return processed successfully!");
      router.push("/returns");
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { detail?: string } } };
      console.error("Failed to process return:", error);
      alert(apiError.response?.data?.detail || "Failed to process return");
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <ProtectedRoute>
      <div className="p-6 h-full overflow-y-auto space-y-6">
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
            <p className="text-muted-foreground">Process customer sale returns or vendor purchase returns</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side - Sale Search & Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Search Source Document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Return Type *</Label>
                <Select
                  value={returnType}
                  onValueChange={(value) => {
                    const nextType = value as "sale" | "purchase";
                    setReturnType(nextType);
                    setSelectedSale(null);
                    setReturnLines([]);
                    setSaleResults([]);
                    setSaleSearch("");
                    setCustomerName("");
                    setCustomerPhone("");
                    setSettlementMode(nextType === "sale" ? "auto" : "added_to_vendor_credit");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">Customer Return (Sale Invoice)</SelectItem>
                    <SelectItem value="purchase">Vendor Return (Purchase Invoice)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={
                    returnType === "sale"
                      ? "Search by invoice/sale id, customer name, or phone..."
                      : "Enter purchase invoice ID..."
                  }
                  value={saleSearch}
                  onChange={(e) => setSaleSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
                {returnType === "sale" && saleLoading && (
                  <div className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-b-2 border-primary" />
                )}
                {returnType === "purchase" && (
                  <Button
                    type="button"
                    size="sm"
                    className="absolute right-1 top-1"
                    disabled={!saleSearch.trim() || purchaseLookupLoading}
                    onClick={() => {
                      const purchaseId = parseInt(saleSearch.trim(), 10);
                      if (!Number.isFinite(purchaseId) || purchaseId <= 0) {
                        alert("Enter a valid purchase ID");
                        return;
                      }
                      void selectPurchase(purchaseId);
                    }}
                  >
                    {purchaseLookupLoading ? "Loading..." : "Load"}
                  </Button>
                )}

                {returnType === "sale" && saleResults.length > 0 && (
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
                            <p className="font-medium">Sale Invoice #{sale.id}</p>
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
                      <p className="font-medium">
                        Selected {selectedSale.source_type === "purchase" ? "Purchase" : "Sale"} #{selectedSale.id}
                      </p>
                      <p className="text-muted-foreground">
                        {selectedSale.customer_name || (selectedSale.source_type === "purchase" ? "Unknown vendor" : "Walk-in")}
                        {selectedSale.customer_phone ? ` • ${selectedSale.customer_phone}` : ""}
                      </p>
                    </div>
                    <div className="font-semibold">rs {selectedSale.total.toFixed(2)}</div>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No document selected</p>
                  <p className="text-sm">
                    {returnType === "sale"
                      ? "Search and select a sale invoice to continue"
                      : "Enter and load a purchase invoice ID to continue"}
                  </p>
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
                                {selectedSale?.source_type === "purchase" ? "Purchased" : "Sold"}: {line.sale_item.quantity} {line.sale_item.unit} • rs {line.sale_item.unit_price.toFixed(2)}
                              </p>
                              {selectedSale?.source_type !== "purchase" && (
                                <p className="text-xs text-muted-foreground">
                                  Item discount on sale: rs {(line.sale_item.item_discount || 0).toFixed(2)}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Returned: {line.returned} • Remaining: {line.remaining}
                              </p>
                              {line.selected && (
                                <p className="text-xs text-muted-foreground">
                                  Return amount: rs {getLineAmounts(line).gross.toFixed(2)} • Discount: -rs {getLineAmounts(line).discount.toFixed(2)} • Refund: rs {getLineAmounts(line).refund.toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              max={line.remaining}
                              value={line.quantityInput}
                              onChange={(e) =>
                                updateReturnQuantity(line.sale_item.id, e.target.value)
                              }
                              className="h-9 w-24"
                              disabled={line.remaining === 0 || !line.selected}
                            />
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={line.restocked}
                                onChange={() => toggleRestocked(line.sale_item.id)}
                                disabled={line.remaining === 0 || !line.selected}
                              />
                              {selectedSale?.source_type === "purchase" ? "Remove Stock" : "Restock"}
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
                <Label>{selectedSale?.source_type === "purchase" ? "Vendor Name (Optional)" : "Customer Name (Optional)"}</Label>
                <Input
                  placeholder={selectedSale?.source_type === "purchase" ? "Enter vendor name" : "Enter customer name"}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{selectedSale?.source_type === "purchase" ? "Vendor Phone (Optional)" : "Customer Phone (Optional)"}</Label>
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
                    {selectedSale?.source_type === "purchase" ? (
                      <>
                        <SelectItem value="auto">Auto (Reduce Payable, remainder Vendor Credit)</SelectItem>
                        <SelectItem value="added_to_vendor_credit">Added to Vendor Credit</SelectItem>
                        <SelectItem value="paid_to_business">Paid to Business (Cash In)</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="auto">Auto (Adjust due first, rest cash)</SelectItem>
                        <SelectItem value="paid_to_customer">Paid to Customer (Cash)</SelectItem>
                        <SelectItem value="added_to_account">Added to Account (Prepaid Credit)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedSale?.source_type === "purchase"
                    ? '"Auto" clears vendor payable first, then keeps any remainder as vendor credit. "Paid to Business" records full cash received.'
                    : '"Added to Account" credits the customer ledger (can become prepaid). "Paid to Customer" gives full cash refund.'}
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
                      .reduce((sum, line) => roundQty(sum + line.quantity), 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {selectedSale?.source_type === "purchase" ? "Removing from Stock:" : "Adding to Stock:"}
                  </span>
                  <span className="font-semibold">
                    {/* Sum the actual quantity per unit (e.g. 0.5 kg), not the number of lines. */}
                    {Object.entries(
                      returnLines
                        .filter((line) => line.selected && line.restocked)
                        .reduce<Record<string, number>>((byUnit, line) => {
                          const unit = line.sale_item.unit || "unit";
                          byUnit[unit] = roundQty((byUnit[unit] || 0) + line.quantity);
                          return byUnit;
                        }, {})
                    )
                      .map(([unit, qty]) => `${qty} ${unit}`)
                      .join(", ") || "0"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {selectedSale?.source_type === "purchase" ? "Estimated Vendor Credit:" : "Estimated Refund:"}
                  </span>
                  <span className="font-semibold">
                    rs {returnLines
                      .filter((line) => line.selected)
                      .reduce((sum, line) => sum + getLineAmounts(line).refund, 0)
                      .toFixed(2)}
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
