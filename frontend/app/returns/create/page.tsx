"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {ProtectedRoute} from "@/components/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Search, Package, Trash2, RotateCcw } from "lucide-react";
import api from "@/lib/api";

interface Product {
  id: number;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  quantity: number;
}

interface ReturnItem {
  product: Product;
  quantity: number;
  add_to_inventory: boolean;
}

export default function CreateReturnPage() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const productsRequestIdRef = useRef(0);
  
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [returnReason, setReturnReason] = useState("defective");
  const [returnNotes, setReturnNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProducts([]);
      setShowAutocomplete(false);
      return;
    }

    const timer = setTimeout(() => {
      fetchProducts(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, token]);

  const fetchProducts = async (searchTerm: string) => {
    const requestId = ++productsRequestIdRef.current;
    try {
      const response = await api.get("/products/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: searchTerm, limit: 500 },
      });
      if (requestId !== productsRequestIdRef.current) {
        return;
      }
      setProducts(response.data);
      setFilteredProducts(response.data);
      setShowAutocomplete(response.data.length > 0);
      setSelectedProductIndex(0);
    } catch (error) {
      console.error("Failed to fetch products:", error);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete || filteredProducts.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedProductIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedProductIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selectedProduct = filteredProducts[selectedProductIndex];
      if (selectedProduct) {
        addToReturn(selectedProduct);
        setSearchQuery("");
        setShowAutocomplete(false);
      }
    } else if (e.key === "Escape") {
      setShowAutocomplete(false);
    }
  };

  const addToReturn = (product: Product) => {
    const existingItem = returnItems.find(
      (item) => item.product.id === product.id
    );

    if (existingItem) {
      setReturnItems(
        returnItems.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setReturnItems([
        ...returnItems,
        { product, quantity: 1, add_to_inventory: true },
      ]);
    }
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setReturnItems(
      returnItems.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const toggleAddToInventory = (productId: number) => {
    setReturnItems(
      returnItems.map((item) =>
        item.product.id === productId
          ? { ...item, add_to_inventory: !item.add_to_inventory }
          : item
      )
    );
  };

  const removeItem = (productId: number) => {
    setReturnItems(returnItems.filter((item) => item.product.id !== productId));
  };

  const processReturn = async () => {
    if (returnItems.length === 0) {
      alert("Please add at least one product");
      return;
    }

    setProcessing(true);
    try {
      await api.post(
        "/returns/",
        {
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          reason: returnReason,
          notes: returnNotes || null,
          items: returnItems.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
            add_to_inventory: item.add_to_inventory,
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
            <p className="text-muted-foreground">Add products and process return</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side - Product Search & Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Search Products</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, SKU, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="pl-9"
                  autoFocus
                />

                {/* Autocomplete Dropdown */}
                {showAutocomplete && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-80 overflow-y-auto">
                    {filteredProducts.map((product, index) => (
                      <div
                        key={product.id}
                        className={`p-3 cursor-pointer hover:bg-muted transition-colors ${
                          index === selectedProductIndex ? "bg-muted" : ""
                        }`}
                        onClick={() => {
                          addToReturn(product);
                          setSearchQuery("");
                          setShowAutocomplete(false);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium">{product.name}</p>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {product.sku}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {product.category}
                              </Badge>
                            </div>
                          </div>
                          <Badge
                            variant={product.quantity > 10 ? "default" : "destructive"}
                            className="ml-2"
                          >
                            Stock: {product.quantity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Return Items List */}
              <div className="space-y-3">
                <Label>Items to Return ({returnItems.length})</Label>
                {returnItems.length === 0 ? (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No items added yet</p>
                    <p className="text-sm">Search and add products above</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {returnItems.map((item) => (
                      <div
                        key={item.product.id}
                        className="border rounded-lg p-3 space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium">{item.product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              SKU: {item.product.sku}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(item.product.id)}
                            className="h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateQuantity(
                                  item.product.id,
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Add to Stock?</Label>
                            <Select
                              value={item.add_to_inventory.toString()}
                              onValueChange={(value) =>
                                value === "toggle" && toggleAddToInventory(item.product.id)
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue>
                                  {item.add_to_inventory ? "Yes" : "No"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="toggle">
                                  {item.add_to_inventory ? "No" : "Yes"}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right Side - Return Details */}
          <Card>
            <CardHeader>
              <CardTitle>Return Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <span className="font-semibold">{returnItems.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Quantity:</span>
                  <span className="font-semibold">
                    {returnItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Adding to Stock:</span>
                  <span className="font-semibold">
                    {returnItems.filter((item) => item.add_to_inventory).length} items
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
                  disabled={returnItems.length === 0 || processing}
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
