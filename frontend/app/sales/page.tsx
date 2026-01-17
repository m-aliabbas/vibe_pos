"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import api, { customerApi, CustomerSimple } from "@/lib/api";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CheckCircle2,
  FileText,
  Filter,
  Package as PackageIcon,
} from "lucide-react";

interface ProductVariation {
  id: number;
  product_id: number;
  attributes: Record<string, string>;
  sku: string | null;
  price_adjustment: number;
  quantity: number;
  barcode: string | null;
}

interface SellingUnit {
  unit: string;
  conversion: number;
  price: number;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  selling_price: number;
  quantity: number;
  vendor_id: number;
  has_variations: boolean;
  variation_attributes: string[];
  base_unit: string;
  selling_units: SellingUnit[];
  variations?: ProductVariation[];
}

interface CartItem {
  product: Product;
  quantity: number;
  variation?: ProductVariation;
  unit: string;
}

export default function SalesTerminal() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  // ✅ Customer fields (separate)
  const [customerId, setCustomerId] = useState(""); // separate customer id field
  const [customerPhone, setCustomerPhone] = useState(""); // separate phone field
  const [customerName, setCustomerName] = useState(""); // optional name
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSimple | null>(
    null
  );
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [discount, setDiscount] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [saleId, setSaleId] = useState<number | null>(null);
  const [completedSaleTotal, setCompletedSaleTotal] = useState<number>(0);
  const [completedAmountPaid, setCompletedAmountPaid] = useState<number>(0);
  const [completedChange, setCompletedChange] = useState<number>(0);

  // Variation picker state
  const [variationDialogOpen, setVariationDialogOpen] = useState(false);
  const [selectedProductForVariation, setSelectedProductForVariation] =
    useState<Product | null>(null);
  const [selectedVariation, setSelectedVariation] =
    useState<ProductVariation | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string>("piece");
  const [quantityForVariation, setQuantityForVariation] = useState<number>(1);

  // Unit picker state (for products without variations but with multiple units)
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [selectedProductForUnit, setSelectedProductForUnit] =
    useState<Product | null>(null);
  const [selectedUnitForRegular, setSelectedUnitForRegular] =
    useState<string>("piece");
  const [quantityForUnit, setQuantityForUnit] = useState<number>(1);

  // Parse quantity from search query (e.g., "milk x 3", "milk 3", "3 milk")
  const parseQuantityFromSearch = (
    query: string
  ): { searchTerm: string; quantity: number } => {
    const trimmed = query.trim();

    // Pattern 1: "milk x 3" or "milk * 3" (with x, *, or ×)
    const pattern1 = /^(.+?)\s*[x*×]\s*(\d+)$/i;
    const match1 = trimmed.match(pattern1);
    if (match1) {
      return { searchTerm: match1[1].trim(), quantity: parseInt(match1[2]) };
    }

    // Pattern 2: "milk 3" (space and number at end)
    const pattern2 = /^(.+?)\s+(\d+)$/;
    const match2 = trimmed.match(pattern2);
    if (match2) {
      return { searchTerm: match2[1].trim(), quantity: parseInt(match2[2]) };
    }

    // Pattern 3: "3 milk" (number at start)
    const pattern3 = /^(\d+)\s+(.+)$/;
    const match3 = trimmed.match(pattern3);
    if (match3) {
      return { searchTerm: match3[2].trim(), quantity: parseInt(match3[1]) };
    }

    return { searchTerm: trimmed, quantity: 1 };
  };

  // Fetch products on mount
  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchProducts();
  }, [token]);

  // Filter products based on search
  useEffect(() => {
    if (
      !searchQuery.trim() &&
      categoryFilter === "All" &&
      stockFilter === "all"
    ) {
      setFilteredProducts(products);
      setShowAutocomplete(false);
      return;
    }

    // Parse to get the actual search term (without quantity)
    const { searchTerm } = parseQuantityFromSearch(searchQuery);
    const query = searchTerm.toLowerCase();

    let filtered = products;

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (categoryFilter !== "All") {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    // Apply stock filter
    if (stockFilter === "low") {
      filtered = filtered.filter((p) => p.quantity > 0 && p.quantity <= 10);
    } else if (stockFilter === "out") {
      filtered = filtered.filter((p) => p.quantity === 0);
    } else if (stockFilter === "in") {
      filtered = filtered.filter((p) => p.quantity > 0);
    }

    setFilteredProducts(filtered);
    setShowAutocomplete(searchQuery.trim() !== "" && filtered.length > 0);
    setSelectedProductIndex(0);
  }, [searchQuery, products, categoryFilter, stockFilter]);

  const fetchProducts = async () => {
    try {
      const response = await api.get("/products/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(response.data);
      setFilteredProducts(response.data);
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
        const { quantity } = parseQuantityFromSearch(searchQuery);
        addToCartWithQuantity(selectedProduct, quantity);
        setSearchQuery("");
        setShowAutocomplete(false);
      }
    } else if (e.key === "Escape") {
      setShowAutocomplete(false);
    }
  };

  const addToCartWithQuantity = (product: Product, quantity: number) => {
    // Check if product has variations - if yes, show variation picker
    if (product.has_variations) {
      setSelectedProductForVariation(product);
      setQuantityForVariation(quantity);
      setSelectedUnit(product.base_unit);
      setVariationDialogOpen(true);
      return;
    }

    // Check if product has selling units - if yes, show unit picker
    if (product.selling_units && product.selling_units.length > 0) {
      setSelectedProductForUnit(product);
      setQuantityForUnit(quantity);
      setSelectedUnitForRegular(product.base_unit);
      setUnitDialogOpen(true);
      return;
    }

    // Check if product has stock
    if (product.quantity === 0) {
      alert("Product out of stock!");
      return;
    }

    const existingItem = cart.find(
      (item) =>
        item.product.id === product.id &&
        !item.variation &&
        item.unit === product.base_unit
    );
    const currentCartQuantity = existingItem ? existingItem.quantity : 0;
    const newTotalQuantity = currentCartQuantity + quantity;

    // Check if we can add the requested quantity
    if (newTotalQuantity > product.quantity) {
      alert(
        `Only ${product.quantity} units available in stock! Currently ${currentCartQuantity} in cart.`
      );
      return;
    }

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id &&
          !item.variation &&
          item.unit === product.base_unit
            ? { ...item, quantity: newTotalQuantity }
            : item
        )
      );
    } else {
      setCart([...cart, { product, quantity, unit: product.base_unit }]);
    }
  };

  const addToCart = (product: Product) => {
    // Check if product has variations - if yes, show variation picker
    if (product.has_variations) {
      setSelectedProductForVariation(product);
      setQuantityForVariation(1);
      setSelectedUnit(product.base_unit);
      setVariationDialogOpen(true);
      return;
    }

    // Check if product has selling units - if yes, show unit picker
    if (product.selling_units && product.selling_units.length > 0) {
      setSelectedProductForUnit(product);
      setQuantityForUnit(1);
      setSelectedUnitForRegular(product.base_unit);
      setUnitDialogOpen(true);
      return;
    }

    // Check if product has stock
    if (product.quantity === 0) {
      alert("Product out of stock!");
      return;
    }

    const existingItem = cart.find(
      (item) =>
        item.product.id === product.id &&
        !item.variation &&
        item.unit === product.base_unit
    );

    if (existingItem) {
      if (existingItem.quantity >= product.quantity) {
        alert(`Only ${product.quantity} units available in stock!`);
        return;
      }
      setCart(
        cart.map((item) =>
          item.product.id === product.id &&
          !item.variation &&
          item.unit === product.base_unit
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { product, quantity: 1, unit: product.base_unit }]);
    }
  };

  const addVariationToCart = () => {
    if (!selectedProductForVariation || !selectedVariation) {
      alert("Please select a variation");
      return;
    }

    if (selectedVariation.quantity === 0) {
      alert("This variation is out of stock!");
      return;
    }

    const unit = selectedUnit;
    let quantityInBaseUnits = quantityForVariation;

    if (unit !== selectedProductForVariation.base_unit) {
      const sellingUnit = selectedProductForVariation.selling_units.find(
        (u) => u.unit === unit
      );
      if (sellingUnit) {
        quantityInBaseUnits = quantityForVariation * sellingUnit.conversion;
      }
    }

    const existingItem = cart.find(
      (item) =>
        item.product.id === selectedProductForVariation.id &&
        item.variation?.id === selectedVariation.id &&
        item.unit === unit
    );

    const currentCartQuantity = existingItem ? existingItem.quantity : 0;
    const newTotalQuantityInBase = existingItem
      ? (currentCartQuantity + quantityForVariation) *
        (unit !== selectedProductForVariation.base_unit
          ? selectedProductForVariation.selling_units.find((u) => u.unit === unit)
              ?.conversion || 1
          : 1)
      : quantityInBaseUnits;

    if (newTotalQuantityInBase > selectedVariation.quantity) {
      alert(
        `Only ${selectedVariation.quantity} ${selectedProductForVariation.base_unit} available for this variation!`
      );
      return;
    }

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === selectedProductForVariation.id &&
          item.variation?.id === selectedVariation.id &&
          item.unit === unit
            ? { ...item, quantity: item.quantity + quantityForVariation }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product: selectedProductForVariation,
          quantity: quantityForVariation,
          variation: selectedVariation,
          unit: unit,
        },
      ]);
    }

    setVariationDialogOpen(false);
    setSelectedProductForVariation(null);
    setSelectedVariation(null);
    setQuantityForVariation(1);
    setSelectedUnit("piece");
  };

  const addUnitToCart = () => {
    if (!selectedProductForUnit) return;

    if (selectedProductForUnit.quantity === 0) {
      alert("This product is out of stock!");
      return;
    }

    const unit = selectedUnitForRegular;
    let quantityInBaseUnits = quantityForUnit;

    if (unit !== selectedProductForUnit.base_unit) {
      const sellingUnit = selectedProductForUnit.selling_units.find(
        (u) => u.unit === unit
      );
      if (sellingUnit) {
        quantityInBaseUnits = quantityForUnit * sellingUnit.conversion;
      }
    }

    const existingItem = cart.find(
      (item) =>
        item.product.id === selectedProductForUnit.id &&
        !item.variation &&
        item.unit === unit
    );

    const currentCartQuantity = existingItem ? existingItem.quantity : 0;
    const newTotalQuantityInBase = existingItem
      ? (currentCartQuantity + quantityForUnit) *
        (unit !== selectedProductForUnit.base_unit
          ? selectedProductForUnit.selling_units.find((u) => u.unit === unit)
              ?.conversion || 1
          : 1)
      : quantityInBaseUnits;

    if (newTotalQuantityInBase > selectedProductForUnit.quantity) {
      alert(
        `Only ${selectedProductForUnit.quantity} ${selectedProductForUnit.base_unit} available!`
      );
      return;
    }

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === selectedProductForUnit.id &&
          !item.variation &&
          item.unit === unit
            ? { ...item, quantity: item.quantity + quantityForUnit }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        { product: selectedProductForUnit, quantity: quantityForUnit, unit: unit },
      ]);
    }

    setUnitDialogOpen(false);
    setSelectedProductForUnit(null);
    setQuantityForUnit(1);
    setSelectedUnitForRegular("piece");
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(index);
      return;
    }

    const item = cart[index];
    const availableStock = item.variation
      ? item.variation.quantity
      : item.product.quantity;

    let quantityInBaseUnits = newQuantity;
    if (item.unit !== item.product.base_unit) {
      const sellingUnit = item.product.selling_units.find(
        (u) => u.unit === item.unit
      );
      if (sellingUnit) {
        quantityInBaseUnits = newQuantity * sellingUnit.conversion;
      }
    }

    if (quantityInBaseUnits > availableStock) {
      alert(`Only ${availableStock} ${item.product.base_unit} available in stock!`);
      return;
    }

    setCart(
      cart.map((cartItem, idx) =>
        idx === index ? { ...cartItem, quantity: newQuantity } : cartItem
      )
    );
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, idx) => idx !== index));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerId("");
    setSelectedCustomer(null);
    setDiscount(0);
    setTax(0);
  };

  // ✅ Customer lookup with BOTH fields
  const handleCustomerLookup = async (phone: string, custId: string) => {
    const phoneVal = phone.trim();
    const idVal = custId.trim();

    // CASE 1: both empty => walk-in
    if (!phoneVal && !idVal) {
      setSelectedCustomer(null);
      return;
    }

    setCustomerSearchLoading(true);
    try {
      let customer: CustomerSimple | null = null;

      // Try phone first if present
      if (phoneVal) {
        customer = await customerApi.searchCustomer({ phone: phoneVal });
      }

      // If not found by phone, try customer_id if present
      if (!customer && idVal) {
        customer = await customerApi.searchCustomer({
          customer_id: idVal.toUpperCase(),
        });
      }

      // If both are filled and phone found but you still want to allow ID-based match:
      if (customer && idVal && customer.customer_id && customer.customer_id !== idVal.toUpperCase()) {
        const byId = await customerApi.searchCustomer({ customer_id: idVal.toUpperCase() });
        if (byId) customer = byId;
      }

      if (customer) {
        setSelectedCustomer(customer);
        // Fill missing display info (don’t override user-typed name if they want)
        setCustomerName(customer.name || "");
        setCustomerPhone(customer.phone || phoneVal || "");
        setCustomerId(customer.customer_id || idVal.toUpperCase() || "");
      } else {
        // Not found => keep typed values; new customer will be created on checkout
        setSelectedCustomer(null);
      }
    } catch (error) {
      console.error("Customer lookup failed:", error);
      setSelectedCustomer(null);
    } finally {
      setCustomerSearchLoading(false);
    }
  };

  // ✅ Debounced lookup when checkout is open and fields change
  useEffect(() => {
    if (!checkoutOpen) return;

    const t = setTimeout(() => {
      handleCustomerLookup(customerPhone, customerId);
    }, 400);

    return () => clearTimeout(t);
  }, [customerPhone, customerId, checkoutOpen]);

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => {
      let itemPrice = item.product.selling_price;

      if (item.variation) {
        itemPrice += item.variation.price_adjustment;
      }

      if (item.unit !== item.product.base_unit) {
        const sellingUnit = item.product.selling_units.find(
          (u) => u.unit === item.unit
        );
        if (sellingUnit) {
          itemPrice = sellingUnit.price;
        }
      }

      return sum + itemPrice * item.quantity;
    }, 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return subtotal - discount + tax;
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      alert("Cart is empty!");
      return;
    }
    setAmountPaid(calculateTotal());
    setCheckoutOpen(true);
  };

  const completeSale = async () => {
    setLoading(true);
    try {
      // CASES:
      // 1) both empty => walk-in (no customer_ref_id)
      // 2) both filled => search/create using both
      // 3) phone filled, id empty => auto customer_id = phone

      const phoneVal = customerPhone.trim();
      const idValRaw = customerId.trim();
      const effectiveCustomerId =
        idValRaw ? idValRaw.toUpperCase() : phoneVal ? phoneVal : "";

      let customerRefId: number | null = null;

      if (selectedCustomer) {
        customerRefId = selectedCustomer.id;
      } else if (phoneVal || effectiveCustomerId) {
        try {
          const customer = await customerApi.findOrCreateCustomer({
            phone: phoneVal || undefined,
            customer_id: effectiveCustomerId || undefined,
            name: customerName.trim() || undefined,
          });
          customerRefId = customer.id;
        } catch (error) {
          console.error("Failed to create/find customer:", error);
        }
      }

      const saleData = {
        customer_ref_id: customerRefId,
        customer_id: effectiveCustomerId || null, // ✅ send effective id (or null)
        customer_name: customerName || null,
        customer_phone: phoneVal || null,
        payment_method: paymentMethod,
        discount: discount,
        tax: tax,
        amount_paid: amountPaid,
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          variation_id: item.variation?.id || null,
          unit: item.unit,
        })),
      };

      const response = await api.post("/sales/", saleData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSaleId(response.data.id);
      setCompletedSaleTotal(response.data.total);
      setCompletedAmountPaid(response.data.amount_paid);
      setCompletedChange(response.data.change_amount);
      setCheckoutOpen(false);
      setSuccessOpen(true);
      clearCart();

      fetchProducts();
    } catch (error: any) {
      console.error("Failed to complete sale:", error);
      alert(
        error.response?.data?.detail || "Failed to complete sale. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNewSale = () => {
    setSuccessOpen(false);
    setSaleId(null);
    clearCart();
  };

  // Get unique categories
  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category)))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sales Terminal</h1>
          <p className="text-muted-foreground">Cashier: {user?.username}</p>
        </div>
        <Card className="px-4 py-2">
          <p className="text-sm text-muted-foreground">Cart Items</p>
          <p className="text-2xl font-bold">{cart.length}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Product Search & List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Product Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters Row */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={stockFilter} onValueChange={setStockFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <PackageIcon className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Stock Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stock</SelectItem>
                    <SelectItem value="in">In Stock</SelectItem>
                    <SelectItem value="low">Low Stock (≤10)</SelectItem>
                    <SelectItem value="out">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Input
                  placeholder="Search by name, SKU... (Try: milk x 3, milk 3, or 3 milk)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => searchQuery && setShowAutocomplete(true)}
                  className="text-lg"
                />
                {showAutocomplete && filteredProducts.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {(() => {
                      const { searchTerm, quantity } =
                        parseQuantityFromSearch(searchQuery);
                      const showQuantityHint =
                        quantity > 1 && searchTerm !== searchQuery;
                      return (
                        <>
                          {showQuantityHint && (
                            <div className="bg-primary/10 px-3 py-2 border-b border-primary/20">
                              <p className="text-sm font-semibold text-primary">
                                📦 Press Enter to add {quantity} units of selected
                                item
                              </p>
                            </div>
                          )}
                          {filteredProducts.slice(0, 10).map((product, index) => (
                            <div
                              key={product.id}
                              className={`p-3 cursor-pointer border-b last:border-b-0 ${
                                index === selectedProductIndex
                                  ? "bg-primary/10 border-l-4 border-l-primary"
                                  : "hover:bg-muted/50"
                              }`}
                              onClick={() => {
                                const { quantity } =
                                  parseQuantityFromSearch(searchQuery);
                                addToCartWithQuantity(product, quantity);
                                setSearchQuery("");
                                setShowAutocomplete(false);
                              }}
                              onMouseEnter={() => setSelectedProductIndex(index)}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex-1">
                                  <p className="font-semibold">{product.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    SKU: {product.sku} | {product.category}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-primary">
                                    ${product.selling_price.toFixed(2)}
                                  </p>
                                  <Badge
                                    variant={
                                      product.quantity > 10
                                        ? "default"
                                        : product.quantity > 0
                                        ? "secondary"
                                        : "destructive"
                                    }
                                    className="text-xs"
                                  >
                                    {product.quantity} in stock
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-muted sticky top-0">
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Name</th>
                      <th className="text-left p-3 font-semibold">SKU</th>
                      <th className="text-left p-3 font-semibold">Category</th>
                      <th className="text-right p-3 font-semibold">Price</th>
                      <th className="text-center p-3 font-semibold">Stock</th>
                      <th className="text-center p-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center p-8 text-muted-foreground"
                        >
                          No products found
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((product) => (
                        <tr
                          key={product.id}
                          className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => addToCart(product)}
                        >
                          <td className="p-3 font-medium">{product.name}</td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {product.sku}
                          </td>
                          <td className="p-3 text-sm">{product.category}</td>
                          <td className="p-3 text-right font-semibold text-primary">
                            ${product.selling_price.toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              variant={
                                product.quantity > 10
                                  ? "default"
                                  : product.quantity > 0
                                  ? "secondary"
                                  : "destructive"
                              }
                            >
                              {product.quantity}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              size="sm"
                              disabled={product.quantity === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(product);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Cart & Checkout */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Shopping Cart
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Cart is empty
                </p>
              ) : (
                <>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {cart.map((item, index) => {
                      let itemPrice = item.product.selling_price;
                      if (item.variation) itemPrice += item.variation.price_adjustment;
                      if (item.unit !== item.product.base_unit) {
                        const sellingUnit = item.product.selling_units.find(
                          (u) => u.unit === item.unit
                        );
                        if (sellingUnit) itemPrice = sellingUnit.price;
                      }

                      return (
                        <div
                          key={`${item.product.id}-${item.variation?.id || "base"}-${
                            item.unit
                          }`}
                          className="flex items-center gap-2 p-2 border rounded"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{item.product.name}</p>
                            {item.variation && (
                              <p className="text-xs text-purple-600">
                                {Object.entries(item.variation.attributes)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(", ")}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              ${itemPrice.toFixed(2)} per {item.unit}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(index, item.quantity - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(index, item.quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              className="h-8 w-8"
                              onClick={() => removeFromCart(index)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span>${calculateSubtotal().toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Discount:</span>
                        <span>-${discount.toFixed(2)}</span>
                      </div>
                    )}
                    {tax > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Tax:</span>
                        <span>+${tax.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xl font-bold border-t pt-2">
                      <span>Total:</span>
                      <span>${calculateTotal().toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button className="w-full" size="lg" onClick={handleCheckout}>
                      <DollarSign className="h-5 w-5 mr-2" />
                      Checkout
                    </Button>
                    <Button variant="outline" className="w-full" onClick={clearCart}>
                      Clear Cart
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Sale</DialogTitle>
            <DialogDescription>
              Enter customer and payment details to complete the transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 relative">
            {/* ✅ Separate fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerId">Customer ID</Label>
                <Input
                  id="customerId"
                  placeholder="e.g., CUST001"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  If empty, we can use phone as ID
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone Number</Label>
                <Input
                  id="customerPhone"
                  placeholder="e.g., 0300xxxxxxx"
                  value={customerPhone}
                  onChange={(e) => {
                    const nextPhone = e.target.value;
                    const prevPhone = customerPhone;

                    setCustomerPhone(nextPhone);

                    // ✅ CASE 3: if ID is empty, auto use phone as customer ID
                    if (!customerId.trim()) {
                      setCustomerId(nextPhone);
                    } else {
                      // If user didn't manually set ID and it was just mirroring phone, keep it in sync
                      if (customerId.trim() === prevPhone.trim()) {
                        setCustomerId(nextPhone);
                      }
                    }
                  }}
                />
              </div>
            </div>

            {customerSearchLoading && (
              <div className="absolute right-6 top-6">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              </div>
            )}

            {/* Status */}
            {selectedCustomer && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-green-800">
                      {selectedCustomer.name || "Customer"}
                    </p>
                    <p className="text-sm text-green-600">
                      {selectedCustomer.customer_id && `ID: ${selectedCustomer.customer_id}`}
                      {selectedCustomer.phone && ` • Phone: ${selectedCustomer.phone}`}
                    </p>
                  </div>
                  {selectedCustomer.outstanding_balance > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      Udhar: ${selectedCustomer.outstanding_balance.toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {!selectedCustomer &&
              (customerId.trim() || customerPhone.trim()) &&
              !customerSearchLoading && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    New customer will be created with:
                    <br />
                    {customerId.trim() && <>ID: <b>{customerId.trim().toUpperCase()}</b></>}
                    {customerId.trim() && customerPhone.trim() && " • "}
                    {customerPhone.trim() && <>Phone: <b>{customerPhone.trim()}</b></>}
                  </p>
                </div>
              )}

            {!customerId.trim() && !customerPhone.trim() && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">
                  Walk-in sale (no customer linked)
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="customer">Customer Name (Optional)</Label>
              <Input
                id="customer"
                placeholder="Enter customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mobile">Mobile Payment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount">Discount ($)</Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">Tax ($)</Label>
                <Input
                  id="tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tax}
                  onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amountPaid">Amount Paid ($)</Label>
              <Input
                id="amountPaid"
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                className="text-lg font-semibold"
              />
              <p className="text-xs text-muted-foreground">
                Enter amount received from customer
              </p>
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total Amount:</span>
                <span className="font-semibold">${calculateTotal().toFixed(2)}</span>
              </div>
              {amountPaid < calculateTotal() && (
                <div className="flex justify-between text-sm text-red-600 font-semibold">
                  <span>Amount Due (Udhar):</span>
                  <span>${(calculateTotal() - amountPaid).toFixed(2)}</span>
                </div>
              )}
              {amountPaid > calculateTotal() && (
                <div className="flex justify-between text-sm text-green-600 font-semibold">
                  <span>Change to Return:</span>
                  <span>${(amountPaid - calculateTotal()).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between text-lg font-bold">
                <span>Amount Paid:</span>
                <span className="text-2xl text-primary">${amountPaid.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckoutOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={completeSale} disabled={loading}>
              {loading ? "Processing..." : "Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
              Sale Completed!
            </DialogTitle>
            <DialogDescription>
              The sale has been successfully processed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="text-center pb-4 border-b">
              <p className="text-sm text-muted-foreground mb-1">Sale ID</p>
              <p className="text-2xl font-bold">#{saleId}</p>
            </div>

            <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Sale:</span>
                <span className="text-xl font-bold text-primary">
                  ${completedSaleTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Amount Paid:</span>
                <span className="text-xl font-semibold text-green-600">
                  ${completedAmountPaid.toFixed(2)}
                </span>
              </div>
              {completedChange > 0 && (
                <div className="flex justify-between items-center pt-3 border-t-2 border-green-600">
                  <span className="text-base font-bold text-green-700">
                    Change to Return:
                  </span>
                  <span className="text-3xl font-bold text-green-700">
                    ${completedChange.toFixed(2)}
                  </span>
                </div>
              )}
              {completedAmountPaid < completedSaleTotal && (
                <div className="flex justify-between items-center pt-3 border-t-2 border-red-600">
                  <span className="text-base font-bold text-red-700">
                    Amount Due (Udhar):
                  </span>
                  <span className="text-3xl font-bold text-red-700">
                    ${(completedSaleTotal - completedAmountPaid).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                if (saleId) router.push(`/sales/invoice/${saleId}`);
              }}
              className="w-full sm:w-auto"
            >
              <FileText className="mr-2 h-4 w-4" />
              View Invoice
            </Button>
            <Button onClick={handleNewSale} className="w-full sm:w-auto">
              New Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variation Picker Dialog */}
      <Dialog open={variationDialogOpen} onOpenChange={setVariationDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Select Variation - {selectedProductForVariation?.name}
            </DialogTitle>
            <DialogDescription>
              Choose the specific variation and quantity
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedProductForVariation?.variations &&
            selectedProductForVariation.variations.length > 0 ? (
              <div className="grid gap-2">
                <Label>Select Variation</Label>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {selectedProductForVariation.variations.map((variation) => {
                    const finalPrice =
                      selectedProductForVariation.selling_price +
                      variation.price_adjustment;
                    return (
                      <button
                        key={variation.id}
                        onClick={() => setSelectedVariation(variation)}
                        className={`p-3 border rounded text-left transition-all ${
                          selectedVariation?.id === variation.id
                            ? "border-blue-500 bg-blue-50"
                            : "hover:border-gray-400"
                        } ${variation.quantity === 0 ? "opacity-50" : ""}`}
                        disabled={variation.quantity === 0}
                      >
                        <div className="font-medium">
                          {Object.entries(variation.attributes)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          ${finalPrice.toFixed(2)} • Stock: {variation.quantity}
                        </div>
                        {variation.quantity === 0 && (
                          <div className="text-xs text-red-600">Out of stock</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                No variations available. Please add variations in inventory management.
              </div>
            )}

            {selectedProductForVariation && (
              <div className="grid gap-2">
                <Label>Selling Unit</Label>
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={selectedProductForVariation.base_unit}>
                      {selectedProductForVariation.base_unit} (Base unit)
                    </SelectItem>
                    {selectedProductForVariation.selling_units.map((unit) => (
                      <SelectItem key={unit.unit} value={unit.unit}>
                        {unit.unit} (×{unit.conversion}) - ${unit.price.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Quantity</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setQuantityForVariation(Math.max(1, quantityForVariation - 1))
                  }
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min="1"
                  value={quantityForVariation}
                  onChange={(e) =>
                    setQuantityForVariation(
                      Math.max(1, parseInt(e.target.value) || 1)
                    )
                  }
                  className="text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantityForVariation(quantityForVariation + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVariationDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addVariationToCart} disabled={!selectedVariation}>
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unit Picker Dialog (for products without variations) */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Unit - {selectedProductForUnit?.name}</DialogTitle>
            <DialogDescription>Choose how you want to sell this product</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedProductForUnit && (
              <div className="grid gap-2">
                <Label>Selling Unit</Label>
                <Select
                  value={selectedUnitForRegular}
                  onValueChange={setSelectedUnitForRegular}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={selectedProductForUnit.base_unit}>
                      {selectedProductForUnit.base_unit} (Base unit) - $
                      {selectedProductForUnit.selling_price.toFixed(2)}
                    </SelectItem>
                    {selectedProductForUnit.selling_units.map((unit) => (
                      <SelectItem key={unit.unit} value={unit.unit}>
                        {unit.unit} (×{unit.conversion}) - ${unit.price.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Quantity</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantityForUnit(Math.max(1, quantityForUnit - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min="1"
                  value={quantityForUnit}
                  onChange={(e) =>
                    setQuantityForUnit(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantityForUnit(quantityForUnit + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selectedProductForUnit && (
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm">
                  <span className="font-medium">Available Stock:</span>{" "}
                  {selectedProductForUnit.quantity} {selectedProductForUnit.base_unit}
                </div>
                {selectedUnitForRegular !== selectedProductForUnit.base_unit && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {quantityForUnit} {selectedUnitForRegular} ={" "}
                    {quantityForUnit *
                      (selectedProductForUnit.selling_units.find(
                        (u) => u.unit === selectedUnitForRegular
                      )?.conversion || 1)}{" "}
                    {selectedProductForUnit.base_unit}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addUnitToCart}>Add to Cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
