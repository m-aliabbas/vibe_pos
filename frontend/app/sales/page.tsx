// app/sales/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import api, {
  customerApi,
  CustomerSimple,
  holdSalesApi,
  HoldSaleResponse,
} from "@/lib/api";
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
  Printer,
  Settings,
} from "lucide-react";
import { storeConfig, fetchStoreConfig, StoreInfo } from "@/lib/store-config";
import { CreditLimitAlert, parseCreditLimitError } from "@/components/CreditLimitAlert";

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
  sku: string | null;
  category: string;
  selling_price: number;
  cost_price: number;
  quantity: number;
  allow_decimal_qty: boolean;
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
  item_discount?: number;
  unit_price?: number;
}

interface SaleSummary {
  totalRevenue: number;
  totalUdhar: number;
  totalCount: number;
  byPayment: Record<string, number>;
}

export default function SalesTerminal() {
  const router = useRouter();
  const { user, token, isLoading } = useAuthStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  // ✅ Customer fields (separate)
  const [customerId, setCustomerId] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSimple | null>(null);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerNameResults, setCustomerNameResults] = useState<CustomerSimple[]>([]);
  const [customerNameLoading, setCustomerNameLoading] = useState(false);
  const [showCustomerNameResults, setShowCustomerNameResults] = useState(false);
  const [selectedCustomerNameIndex, setSelectedCustomerNameIndex] = useState(0);

  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [discount, setDiscount] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [deliveryCharges, setDeliveryCharges] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [creditLimitAlert, setCreditLimitAlert] = useState<{
    limit: number; current: number; available: number; attempted?: number;
  } | null>(null);
  const [saleId, setSaleId] = useState<number | null>(null);
  const [completedSaleTotal, setCompletedSaleTotal] = useState<number>(0);
  const [completedAmountPaid, setCompletedAmountPaid] = useState<number>(0);
  const [completedChange, setCompletedChange] = useState<number>(0);

  const [summaryOpen, setSummaryOpen] = useState<boolean>(false);
  const [heldSales, setHeldSales] = useState<HoldSaleResponse[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [productsListOpen, setProductsListOpen] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [storeInfo, setStoreInfo] = useState<StoreInfo>(storeConfig);

  const [todayStats, setTodayStats] = useState<SaleSummary>({
    totalRevenue: 0,
    totalUdhar: 0,
    totalCount: 0,
    byPayment: { cash: 0, card: 0, mobile: 0, other: 0 },
  });

  const [todayUserStats, setTodayUserStats] = useState<SaleSummary>({
    totalRevenue: 0,
    totalUdhar: 0,
    totalCount: 0,
    byPayment: { cash: 0, card: 0, mobile: 0, other: 0 },
  });

  const fetchProductsRequestIdRef = useRef(0);
  const customerLookupRequestIdRef = useRef(0);
  const customerNameLookupRequestIdRef = useRef(0);
  const skipNextCustomerLookupRef = useRef(false);
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  const amountPaidInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteListRef = useRef<HTMLDivElement | null>(null);
  const customerNameListRef = useRef<HTMLDivElement | null>(null);

  const latestSaleSnapshotRef = useRef<{
    cart: CartItem[];
    customerId: string;
    customerPhone: string;
    customerName: string;
    selectedCustomer: CustomerSimple | null;
    paymentMethod: string;
    discount: number;
    tax: number;
    deliveryCharges: number;
    amountPaid: string;
    token: string | null;
  }>({
    cart: [],
    customerId: "",
    customerPhone: "",
    customerName: "",
    selectedCustomer: null,
    paymentMethod: "cash",
    discount: 0,
    tax: 0,
    deliveryCharges: 0,
    amountPaid: "",
    token: null,
  });

  const autoHoldInFlightRef = useRef(false);
  const lastAutoHoldSignatureRef = useRef<string>("");

  // Variation picker state
  const [variationDialogOpen, setVariationDialogOpen] = useState(false);
  const [selectedProductForVariation, setSelectedProductForVariation] = useState<Product | null>(
    null
  );
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const addVariationToCartRef = useRef<() => Promise<void>>(async () => {});
  const quantityForVariationInputRef = useRef<HTMLInputElement>(null);
  const [selectedUnit, setSelectedUnit] = useState<string>("piece");
  const [quantityForVariation, setQuantityForVariation] = useState<string>("1");
  const [variationDiscount, setVariationDiscount] = useState<number>(0);
  const [variationUnitPrice, setVariationUnitPrice] = useState<string>("");
  const [variationPriceOverrideEnabled, setVariationPriceOverrideEnabled] = useState(false);

  // Unit picker state (for products without variations but with multiple units)
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [selectedProductForUnit, setSelectedProductForUnit] = useState<Product | null>(null);
  const [selectedUnitForRegular, setSelectedUnitForRegular] = useState<string>("piece");
  const [quantityForUnit, setQuantityForUnit] = useState<string>("1");
  const [unitDiscount, setUnitDiscount] = useState<number>(0);
  const [unitPriceOverride, setUnitPriceOverride] = useState<string>("");
  const [unitPriceOverrideEnabled, setUnitPriceOverrideEnabled] = useState(false);

  // Editing mode - tracks if we're editing existing cart item
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);

  const formatCurrency = useCallback((amount: number) => {
    const formatted = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
    return `rs ${formatted}`;
  }, []);

  const normalizeQuantityForProduct = useCallback((product: Product, quantity: number): number => {
    if (!Number.isFinite(quantity) || quantity <= 0) return 0;
    if (product.allow_decimal_qty) return Math.max(0, quantity);
    return Math.max(0, Math.round(quantity));
  }, []);

  const parseDraftQuantity = useCallback((draft: string): number | null => {
    const trimmed = (draft || "").trim();
    if (trimmed === "") return null;
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  // Parse quantity from search query (e.g., "milk x 3", "milk 3", "3 milk")
  const parseQuantityFromSearch = useCallback(
    (query: string): { searchTerm: string; quantity: number } => {
      const trimmed = (query || "").trim();

      // Pattern 1: "milk x 3" or "milk * 3" (with x, *, or ×)
      const pattern1 = /^(.+?)\s*[x*×]\s*([\d\.]+)$/i;
      const match1 = trimmed.match(pattern1);
      if (match1) {
        const qty = parseFloat(match1[2]);
        return {
          searchTerm: match1[1].trim(),
          quantity: Number.isFinite(qty) ? qty : 1,
        };
      }

      // Pattern 2: "milk 3" (space and number at end)
      const pattern2 = /^(.+?)\s+([\d\.]+)$/;
      const match2 = trimmed.match(pattern2);
      if (match2) {
        const qty = parseFloat(match2[2]);
        return {
          searchTerm: match2[1].trim(),
          quantity: Number.isFinite(qty) ? qty : 1,
        };
      }

      // Pattern 3: "3 milk" (number at start)
      const pattern3 = /^([\d\.]+)\s+(.+)$/;
      const match3 = trimmed.match(pattern3);
      if (match3) {
        const qty = parseFloat(match3[1]);
        return {
          searchTerm: match3[2].trim(),
          quantity: Number.isFinite(qty) ? qty : 1,
        };
      }

      return { searchTerm: trimmed, quantity: 1 };
    },
    []
  );

  const fetchProducts = useCallback(
    async (params?: { search?: string; category?: string }) => {
      const requestId = ++fetchProductsRequestIdRef.current;
      try {
        const response = await api.get("/products/", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          params: { limit: 500, ...params },
        });

        if (requestId !== fetchProductsRequestIdRef.current) return;

        setProducts(response.data);
        setFilteredProducts(response.data);
      } catch (error) {
        console.error("Failed to fetch products:", error);
      }
    },
    [token]
  );

  const updateLocalProduct = useCallback(
    (productId: number, updater: (p: Product) => Product) => {
      setProducts((prev) => prev.map((p) => (p.id === productId ? updater(p) : p)));
      setFilteredProducts((prev) => prev.map((p) => (p.id === productId ? updater(p) : p)));
      setSelectedProductForVariation((prev) => (prev && prev.id === productId ? updater(prev) : prev));
      setSelectedProductForUnit((prev) => (prev && prev.id === productId ? updater(prev) : prev));
    },
    []
  );

  const buildSummary = useCallback((sales: any[]): SaleSummary => {
    const summary: SaleSummary = {
      totalRevenue: 0,
      totalUdhar: 0,
      totalCount: (sales || []).length,
      byPayment: { cash: 0, card: 0, mobile: 0, other: 0 },
    };

    for (const sale of sales || []) {
      summary.totalRevenue += sale.total || 0;
      summary.totalUdhar += sale.amount_due || 0;
      const method = (sale.payment_method || "other").toLowerCase();
      if (!summary.byPayment[method]) summary.byPayment[method] = 0;
      summary.byPayment[method] += sale.total || 0;
    }

    return summary;
  }, []);

  const fetchTodayStats = useCallback(async () => {
    if (!token) return;
    try {
      const today = new Date().toISOString().slice(0, 10);

      const { data: allSales } = await api.get("/sales/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { start_date: today, end_date: today, limit: 2000 },
      });

      setTodayStats(buildSummary(allSales || []));

      if (user?.id) {
        const { data: userSales } = await api.get("/sales/", {
          headers: { Authorization: `Bearer ${token}` },
          params: { start_date: today, end_date: today, user_id: user.id, limit: 2000 },
        });
        setTodayUserStats(buildSummary(userSales || []));
      } else {
        setTodayUserStats(buildSummary(allSales || []));
      }
    } catch (error) {
      console.error("Failed to fetch today stats:", error);
    }
  }, [token, user?.id, buildSummary]);

  const fetchHeldSales = useCallback(async () => {
    try {
      const data = await holdSalesApi.list();
      setHeldSales(data || []);
    } catch (error) {
      console.error("Failed to fetch held sales:", error);
    }
  }, []);

  const calculateSubtotal = useCallback(() => {
    return cart.reduce((sum, item) => {
      let itemPrice =
        typeof item.unit_price === "number" ? item.unit_price : item.product.selling_price;

      if (item.variation && typeof item.unit_price !== "number") {
        itemPrice += item.variation.price_adjustment;
      }

      if (item.unit !== item.product.base_unit && typeof item.unit_price !== "number") {
        const sellingUnit = item.product.selling_units.find((u) => u.unit === item.unit);
        if (sellingUnit) itemPrice = sellingUnit.price;
      }

      return sum + itemPrice * item.quantity;
    }, 0);
  }, [cart]);

  const calculateItemDiscounts = useCallback(() => {
    return cart.reduce((sum, item) => sum + (item.item_discount || 0), 0);
  }, [cart]);

  const calculateTotal = useCallback(() => {
    const subtotal = calculateSubtotal();
    const itemDiscounts = calculateItemDiscounts();
    return subtotal - itemDiscounts - discount + tax + deliveryCharges;
  }, [calculateSubtotal, calculateItemDiscounts, discount, tax, deliveryCharges]);

  const calculateHeldTotal = useCallback(
    (hold: HoldSaleResponse) => {
      const payload = hold.payload;

      const subtotal = (payload.cart || []).reduce((sum, item) => {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) return sum;

        let itemPrice =
          typeof item.unit_price === "number" ? item.unit_price : product.selling_price;

        if (item.variation_id && typeof item.unit_price !== "number") {
          const variation = product.variations?.find((v) => v.id === item.variation_id);
          if (variation) itemPrice += variation.price_adjustment;
        }

        if (item.unit !== product.base_unit && typeof item.unit_price !== "number") {
          const sellingUnit = product.selling_units.find((u) => u.unit === item.unit);
          if (sellingUnit) itemPrice = sellingUnit.price;
        }

        return sum + itemPrice * item.quantity;
      }, 0);

      const itemDiscounts = (payload.cart || []).reduce(
        (sum, item) => sum + (item.item_discount || 0),
        0
      );

      return (
        subtotal -
        itemDiscounts -
        (payload.discount || 0) +
        (payload.tax || 0) +
        (payload.deliveryCharges || 0)
      );
    },
    [products]
  );

  const removeFromCart = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const updateQuantity = useCallback(
    (index: number, newQuantity: number) => {
      if (newQuantity <= 0) {
        removeFromCart(index);
        return;
      }

      const item = cart[index];
      if (!item) return;
      const normalizedQuantity = normalizeQuantityForProduct(item.product, newQuantity);

      const availableStock = item.variation ? item.variation.quantity : item.product.quantity;

      let quantityInBaseUnits = normalizedQuantity;
      if (item.unit !== item.product.base_unit) {
        const sellingUnit = item.product.selling_units.find((u) => u.unit === item.unit);
        if (sellingUnit) quantityInBaseUnits = normalizedQuantity * sellingUnit.conversion;
      }

      if (quantityInBaseUnits > availableStock) {
        const willGoNegative = quantityInBaseUnits - availableStock;
        if (
          !confirm(
            `⚠️ Warning: Only ${availableStock} ${item.product.base_unit} in stock!\nSetting quantity to ${normalizedQuantity} will result in negative stock (-${willGoNegative}).\n\nContinue anyway?`
          )
        ) {
          return;
        }
      }

      setCart((prev) => prev.map((cartItem, idx) => (idx === index ? { ...cartItem, quantity: normalizedQuantity } : cartItem)));
    },
    [cart, normalizeQuantityForProduct, removeFromCart]
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerId("");
    setSelectedCustomer(null);
    setDiscount(0);
    setTax(0);
    setDeliveryCharges(0);
    setAmountPaid("");
  }, []);

  const buildHoldRequest = useCallback((snapshot: {
    cart: CartItem[];
    customerId: string;
    customerPhone: string;
    customerName: string;
    selectedCustomer: CustomerSimple | null;
    paymentMethod: string;
    discount: number;
    tax: number;
    deliveryCharges: number;
    amountPaid: string;
  }) => {
    const labelParts = [
      snapshot.customerName.trim(),
      snapshot.customerPhone.trim(),
      snapshot.customerId.trim().toUpperCase(),
    ].filter(Boolean);
    const label = labelParts.length > 0 ? labelParts.join(" • ") : "Walk-in";

    const payload = {
      cart: snapshot.cart.map((item) => ({
        product_id: item.product.id,
        variation_id: item.variation?.id || null,
        unit: item.unit,
        quantity: item.quantity,
        item_discount: item.item_discount || 0,
        unit_price: typeof item.unit_price === "number" ? item.unit_price : undefined,
      })),
      customerId: snapshot.customerId,
      customerPhone: snapshot.customerPhone,
      customerName: snapshot.customerName,
      selectedCustomer: snapshot.selectedCustomer,
      paymentMethod: snapshot.paymentMethod,
      discount: snapshot.discount,
      tax: snapshot.tax,
      deliveryCharges: snapshot.deliveryCharges,
      amountPaid: snapshot.amountPaid,
    };

    const signature = JSON.stringify(payload);
    return { label, payload, signature };
  }, []);

  const autoHoldCurrentSale = useCallback(async () => {
    const snapshot = latestSaleSnapshotRef.current;
    if (snapshot.cart.length === 0 || autoHoldInFlightRef.current) return;

    const { label, payload, signature } = buildHoldRequest(snapshot);
    if (signature === lastAutoHoldSignatureRef.current) return;

    autoHoldInFlightRef.current = true;
    try {
      await holdSalesApi.create({ label, payload });
      lastAutoHoldSignatureRef.current = signature;
    } catch (error) {
      console.error("Auto-hold failed:", error);
    } finally {
      autoHoldInFlightRef.current = false;
    }
  }, [buildHoldRequest]);

  const autoHoldWithKeepAlive = useCallback(() => {
    const snapshot = latestSaleSnapshotRef.current;
    if (!snapshot.token || snapshot.cart.length === 0) return;

    const { label, payload, signature } = buildHoldRequest(snapshot);
    if (signature === lastAutoHoldSignatureRef.current) return;

    const endpoint = "http://127.0.0.1:8000/api/v1/hold-sales/";
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${snapshot.token}`,
      },
      body: JSON.stringify({ label, payload }),
      keepalive: true,
    }).catch((error) => {
      console.error("Auto-hold keepalive failed:", error);
    });

    lastAutoHoldSignatureRef.current = signature;
  }, [buildHoldRequest]);

  const holdCurrentSale = useCallback(async () => {
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    const { label, payload, signature } = buildHoldRequest({
      cart,
      customerId,
      customerPhone,
      customerName,
      selectedCustomer,
      paymentMethod,
      discount,
      tax,
      deliveryCharges,
      amountPaid,
    });

    try {
      await holdSalesApi.create({ label, payload });
      lastAutoHoldSignatureRef.current = signature;
      clearCart();
      fetchHeldSales();
      
      // Auto-focus search bar after holding sale
      setTimeout(() => productSearchInputRef.current?.focus(), 50);
    } catch (error) {
      console.error("Failed to hold sale:", error);
      alert("Failed to hold sale");
    }
  }, [
    cart,
    customerId,
    customerPhone,
    customerName,
    selectedCustomer,
    paymentMethod,
    discount,
    tax,
    deliveryCharges,
    amountPaid,
    buildHoldRequest,
    clearCart,
    fetchHeldSales,
  ]);

  const deleteHeldSale = useCallback(
    async (holdId: number) => {
      try {
        await holdSalesApi.delete(holdId);
        fetchHeldSales();
      } catch (error) {
        console.error("Failed to delete hold sale:", error);
      }
    },
    [fetchHeldSales]
  );

  const resumeHeldSale = useCallback(
    async (hold: HoldSaleResponse) => {
      const payload = hold.payload;

      const getProductById = async (productId: number) => {
        const existing = products.find((p) => p.id === productId);
        if (existing) return existing;
        const response = await api.get(`/products/${productId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const product = response.data as Product;
        setProducts((prev) => [...prev, product]);
        return product;
      };

      const cartItems: CartItem[] = [];

      for (const item of payload.cart || []) {
        try {
          const product = await getProductById(item.product_id);

          let variation = item.variation_id
            ? product.variations?.find((v) => v.id === item.variation_id)
            : undefined;

          if (item.variation_id && !variation) {
            const variationsRes = await api.get(`/products/${product.id}/variations`, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            const variations = variationsRes.data as ProductVariation[];
            variation = variations.find((v) => v.id === item.variation_id);
            if (variations.length > 0) {
              updateLocalProduct(product.id, (p) => ({ ...p, variations }));
            }
          }

          cartItems.push({
            product,
            quantity: item.quantity,
            variation,
            unit: item.unit,
            item_discount: item.item_discount || 0,
            unit_price: item.unit_price,
          });
        } catch (error) {
          console.error("Failed to restore item:", error);
        }
      }

      setCart(cartItems);
      setCustomerId(payload.customerId || "");
      setCustomerPhone(payload.customerPhone || "");
      setCustomerName(payload.customerName || "");
      setSelectedCustomer(payload.selectedCustomer || null);
      setPaymentMethod(payload.paymentMethod || "cash");
      setDiscount(payload.discount || 0);
      setTax(payload.tax || 0);
      setDeliveryCharges(payload.deliveryCharges || 0);
      setAmountPaid(payload.amountPaid || "");

      try {
        await holdSalesApi.delete(hold.id);
        fetchHeldSales();
      } catch (error) {
        console.error("Failed to remove hold sale:", error);
      }
    },
    [products, token, updateLocalProduct, fetchHeldSales]
  );

  // ✅ Customer lookup with BOTH fields
  const handleCustomerLookup = useCallback(
    async (phone: string, custId: string) => {
      const phoneVal = (phone || "").trim();
      const idVal = (custId || "").trim();

      if (!phoneVal && !idVal) {
        setSelectedCustomer(null);
        return;
      }

      const requestId = ++customerLookupRequestIdRef.current;
      setCustomerSearchLoading(true);

      try {
        let customer: CustomerSimple | null = null;

        if (phoneVal) {
          customer = await customerApi.searchCustomer({ phone: phoneVal });
        }

        if (!customer && idVal) {
          customer = await customerApi.searchCustomer({ customer_id: idVal.toUpperCase() });
        }

        if (customer && idVal && customer.customer_id && customer.customer_id !== idVal.toUpperCase()) {
          const byId = await customerApi.searchCustomer({ customer_id: idVal.toUpperCase() });
          if (byId) customer = byId;
        }

        if (requestId !== customerLookupRequestIdRef.current) return;

        if (customer) {
          setSelectedCustomer(customer);
          setCustomerName(customer.name || "");
          // Only update fields that weren't used for searching
          // Don't override the user's input in the field they're typing in
          if (!phoneVal && customer.phone) {
            setCustomerPhone(customer.phone);
          }
          if (!idVal && customer.customer_id) {
            setCustomerId(customer.customer_id);
          }
        } else {
          setSelectedCustomer(null);
        }
      } catch (error) {
        console.error("Customer lookup failed:", error);
        setSelectedCustomer(null);
      } finally {
        if (requestId === customerLookupRequestIdRef.current) {
          setCustomerSearchLoading(false);
        }
      }
    },
    []
  );

  // Determine if we should show unit selection dialog
  const shouldShowUnitDialog = useCallback((product: Product): boolean => {
    if (!product.selling_units || product.selling_units.length === 0) {
      return false;
    }
    
    // 3+ units → always show dialog
    if (product.selling_units.length >= 3) {
      return true;
    }
    
    // 2+ units → show dialog only if base_unit is NOT in the list
    if (product.selling_units.length >= 2) {
      const hasBaseUnit = product.selling_units.some(u => u.unit === product.base_unit);
      return !hasBaseUnit; // Show dialog if base unit is missing
    }
    
    // 1 unit → don't show dialog, use base unit
    return false;
  }, []);

  const addToCartWithQuantity = useCallback(
    (product: Product, quantity: number) => {
      const normalizedQuantity = normalizeQuantityForProduct(product, quantity);
      // Open variation picker dialog for all products
      setSelectedProductForVariation(product);
      setQuantityForVariation(String(normalizedQuantity));
      setSelectedUnit(product.base_unit);
      setVariationPriceOverrideEnabled(false);
      setSelectedVariation(null);
      setVariationDialogOpen(true);
      return;
    },
    [cart, normalizeQuantityForProduct, shouldShowUnitDialog]
  );

  const addToCart = useCallback(
    (product: Product) => {
      // Open variation picker dialog for all products
      setSelectedProductForVariation(product);
      setQuantityForVariation("1");
      setSelectedUnit(product.base_unit);
      setSelectedVariation(null);
      setVariationDialogOpen(true);
    },
    []
  );

  const addVariationToCart = useCallback(async () => {
    if (!selectedProductForVariation) {
      alert("Please select a product");
      return;
    }

    // For products with variations, require a variation to be selected
    if (selectedProductForVariation.has_variations && !selectedVariation) {
      alert("Please select a variation");
      return;
    }

    // Check if we're editing an existing cart item
    const isEditing = editingCartIndex !== null;

    const draftQuantity = parseDraftQuantity(quantityForVariation);
    if (draftQuantity === null) {
      alert("Please enter quantity");
      return;
    }
    const normalizedQuantity = normalizeQuantityForProduct(selectedProductForVariation, draftQuantity);
    if (normalizedQuantity <= 0) {
      alert("Please enter a valid quantity");
      return;
    }

    const unit = selectedUnit;
    let quantityInBaseUnits = normalizedQuantity;

    if (unit !== selectedProductForVariation.base_unit) {
      const sellingUnit = selectedProductForVariation.selling_units.find((u) => u.unit === unit);
      if (sellingUnit) quantityInBaseUnits = normalizedQuantity * sellingUnit.conversion;
    }

    // Determine available stock
    const availableStock = selectedVariation ? selectedVariation.quantity : selectedProductForVariation.quantity;

    const existingItem = cart.find(
      (item) =>
        item.product.id === selectedProductForVariation.id &&
        item.variation?.id === selectedVariation?.id &&
        item.unit === unit
    );

    const currentCartQuantity = existingItem ? existingItem.quantity : 0;

    const newTotalQuantityInBase = existingItem
      ? (currentCartQuantity + normalizedQuantity) *
      (unit !== selectedProductForVariation.base_unit
        ? selectedProductForVariation.selling_units.find((u) => u.unit === unit)?.conversion || 1
        : 1)
      : quantityInBaseUnits;

    if (newTotalQuantityInBase > availableStock) {
      const willGoNegative = newTotalQuantityInBase - availableStock;
      const stockLabel = selectedVariation 
        ? `${availableStock} ${selectedProductForVariation.base_unit} in stock for this variation`
        : `${availableStock} ${selectedProductForVariation.base_unit} in stock`;
      if (
        !confirm(
          `⚠️ Warning: Only ${stockLabel}!\nAdding this will result in negative stock (-${willGoNegative}).\n\nContinue anyway?`
        )
      ) {
        return;
      }
    }

    const parsedUnitPrice = parseFloat(variationUnitPrice);
    const unitPriceValue =
      variationPriceOverrideEnabled && Number.isFinite(parsedUnitPrice) ? parsedUnitPrice : undefined;

    if (variationPriceOverrideEnabled) {
      if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
        alert("Please enter a valid selling price");
        return;
      }

      try {
        if (unit !== selectedProductForVariation.base_unit) {
          const updatedUnits = selectedProductForVariation.selling_units.map((u) =>
            u.unit === unit ? { ...u, price: parsedUnitPrice } : u
          );

          await api.put(`/products/${selectedProductForVariation.id}`, {
            selling_units: updatedUnits,
          });

          updateLocalProduct(selectedProductForVariation.id, (p) => ({ ...p, selling_units: updatedUnits }));
        } else if (selectedVariation) {
          const newAdjustment = parsedUnitPrice - selectedProductForVariation.selling_price;

          await api.put(`/products/variations/${selectedVariation.id}`, {
            price_adjustment: newAdjustment,
          });

          updateLocalProduct(selectedProductForVariation.id, (p) => ({
            ...p,
            variations: p.variations?.map((v) =>
              v.id === selectedVariation.id ? { ...v, price_adjustment: newAdjustment } : v
            ),
          }));
        } else {
          // Update base product price
          await api.put(`/products/${selectedProductForVariation.id}`, {
            selling_price: parsedUnitPrice,
          });

          updateLocalProduct(selectedProductForVariation.id, (p) => ({ ...p, selling_price: parsedUnitPrice }));
        }
      } catch (error) {
        console.error("Failed to update selling price", error);
        alert("Failed to update selling price in database");
        return;
      }
    }

    if (isEditing && editingCartIndex !== null) {
      // Update existing cart item
      setCart((prev) =>
        prev.map((item, idx) =>
          idx === editingCartIndex
            ? {
                ...item,
                quantity: normalizedQuantity,
                variation: selectedVariation || undefined,
                unit: unit,
                item_discount: variationDiscount || 0,
                unit_price: unitPriceValue,
              }
            : item
        )
      );
    } else if (existingItem) {
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === selectedProductForVariation.id &&
            item.variation?.id === selectedVariation?.id &&
            item.unit === unit
            ? {
              ...item,
              quantity: item.quantity + normalizedQuantity,
              item_discount: (item.item_discount || 0) + variationDiscount,
              unit_price: unitPriceValue ?? item.unit_price,
            }
            : item
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          product: selectedProductForVariation,
          quantity: normalizedQuantity,
          variation: selectedVariation || undefined,
          unit,
          item_discount: variationDiscount,
          unit_price: unitPriceValue,
        },
      ]);
    }

    // Close dialog after adding to cart
    setVariationDialogOpen(false);
    setSelectedProductForVariation(null);
    setSelectedVariation(null);
    setQuantityForVariation("1");
    setSelectedUnit("piece");
    setVariationDiscount(0);
    setVariationUnitPrice("");
    setVariationPriceOverrideEnabled(false);
    setEditingCartIndex(null);
    
    // Auto-focus search bar for next item
    setTimeout(() => productSearchInputRef.current?.focus(), 50);
  }, [
    selectedProductForVariation,
    selectedVariation,
    selectedUnit,
    quantityForVariation,
    parseDraftQuantity,
    normalizeQuantityForProduct,
    cart,
    variationDiscount,
    variationUnitPrice,
    variationPriceOverrideEnabled,
    updateLocalProduct,
    editingCartIndex,
  ]);

  // Keep ref in sync so the keydown listener always has the latest version
  addVariationToCartRef.current = addVariationToCart;

  const addUnitToCart = useCallback(async () => {
    if (!selectedProductForUnit) return;

    // Check if we're editing an existing cart item
    const isEditing = editingCartIndex !== null;

    const draftQuantity = parseDraftQuantity(quantityForUnit);
    if (draftQuantity === null) {
      alert("Please enter quantity");
      return;
    }
    const normalizedQuantity = normalizeQuantityForProduct(selectedProductForUnit, draftQuantity);
    if (normalizedQuantity <= 0) {
      alert("Please enter a valid quantity");
      return;
    }

    const unit = selectedUnitForRegular;
    let quantityInBaseUnits = normalizedQuantity;

    if (unit !== selectedProductForUnit.base_unit) {
      const sellingUnit = selectedProductForUnit.selling_units.find((u) => u.unit === unit);
      if (sellingUnit) quantityInBaseUnits = normalizedQuantity * sellingUnit.conversion;
    }

    const existingItem = cart.find(
      (item) => item.product.id === selectedProductForUnit.id && !item.variation && item.unit === unit
    );

    const currentCartQuantity = existingItem ? existingItem.quantity : 0;

    const newTotalQuantityInBase = existingItem
      ? (currentCartQuantity + normalizedQuantity) *
      (unit !== selectedProductForUnit.base_unit
        ? selectedProductForUnit.selling_units.find((u) => u.unit === unit)?.conversion || 1
        : 1)
      : quantityInBaseUnits;

    if (newTotalQuantityInBase > selectedProductForUnit.quantity) {
      const willGoNegative = newTotalQuantityInBase - selectedProductForUnit.quantity;
      if (
        !confirm(
          `⚠️ Warning: Only ${selectedProductForUnit.quantity} ${selectedProductForUnit.base_unit} in stock!\nAdding this will result in negative stock (-${willGoNegative}).\n\nContinue anyway?`
        )
      ) {
        return;
      }
    }

    const parsedUnitPrice = parseFloat(unitPriceOverride);
    const unitPriceValue =
      unitPriceOverrideEnabled && Number.isFinite(parsedUnitPrice) ? parsedUnitPrice : undefined;

    if (unitPriceOverrideEnabled) {
      if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
        alert("Please enter a valid selling price");
        return;
      }

      try {
        if (unit !== selectedProductForUnit.base_unit) {
          const updatedUnits = selectedProductForUnit.selling_units.map((u) =>
            u.unit === unit ? { ...u, price: parsedUnitPrice } : u
          );

          await api.put(`/products/${selectedProductForUnit.id}`, {
            selling_units: updatedUnits,
          });

          updateLocalProduct(selectedProductForUnit.id, (p) => ({ ...p, selling_units: updatedUnits }));
        } else {
          await api.put(`/products/${selectedProductForUnit.id}`, {
            selling_price: parsedUnitPrice,
          });

          updateLocalProduct(selectedProductForUnit.id, (p) => ({ ...p, selling_price: parsedUnitPrice }));
        }
      } catch (error) {
        console.error("Failed to update selling price", error);
        alert("Failed to update selling price in database");
        return;
      }
    }

    if (isEditing && editingCartIndex !== null) {
      // Update existing cart item
      setCart((prev) =>
        prev.map((item, idx) =>
          idx === editingCartIndex
            ? {
                ...item,
                quantity: normalizedQuantity,
                unit: unit,
                item_discount: unitDiscount || 0,
                unit_price: unitPriceValue,
              }
            : item
        )
      );
    } else if (existingItem) {
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === selectedProductForUnit.id && !item.variation && item.unit === unit
            ? {
              ...item,
              quantity: item.quantity + normalizedQuantity,
              item_discount: (item.item_discount || 0) + unitDiscount,
              unit_price: unitPriceValue ?? item.unit_price,
            }
            : item
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          product: selectedProductForUnit,
          quantity: normalizedQuantity,
          unit,
          item_discount: unitDiscount,
          unit_price: unitPriceValue,
        },
      ]);
    }

    setUnitDialogOpen(false);
    setSelectedProductForUnit(null);
    setQuantityForUnit("1");
    setSelectedUnitForRegular("piece");
    setUnitDiscount(0);
    
    // Auto-focus search bar for next item
    setTimeout(() => productSearchInputRef.current?.focus(), 50);
    setUnitPriceOverride("");
    setUnitPriceOverrideEnabled(false);
    setEditingCartIndex(null);
  }, [
    selectedProductForUnit,
    selectedUnitForRegular,
    quantityForUnit,
    parseDraftQuantity,
    normalizeQuantityForProduct,
    cart,
    unitDiscount,
    unitPriceOverride,
    unitPriceOverrideEnabled,
    updateLocalProduct,
    editingCartIndex,
  ]);

  // Barcode lookup function - searches for exact barcode match and auto-adds to cart
  const lookupAndAddByBarcode = useCallback(
    async (barcode: string, quantity: number = 1) => {
      try {
        const response = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
        const { product, variation, match_type } = response.data;

        if (!product) return false;

        // Convert backend product to frontend Product type
        const frontendProduct: Product = {
          ...product,
          variations: product.variations || [],
        };

        const normalizedQuantity = normalizeQuantityForProduct(frontendProduct, quantity);

        if (variation) {
          // It's a variation barcode - add the specific variation to cart
          const existingItem = cart.find(
            (item) =>
              item.product.id === frontendProduct.id &&
              item.variation?.id === variation.id &&
              item.unit === frontendProduct.base_unit
          );

          const currentCartQuantity = existingItem ? existingItem.quantity : 0;
          const newTotalQuantity = currentCartQuantity + normalizedQuantity;

          if (newTotalQuantity > variation.quantity) {
            const willGoNegative = newTotalQuantity - variation.quantity;
            if (
              !confirm(
                `⚠️ Warning: Only ${variation.quantity} units in stock for this variation!\nAdding ${normalizedQuantity} will result in negative stock (-${willGoNegative}).\n\nContinue anyway?`
              )
            ) {
              return true; // Still count as handled
            }
          }

          if (existingItem) {
            setCart((prev) =>
              prev.map((item) =>
                item.product.id === frontendProduct.id &&
                item.variation?.id === variation.id &&
                item.unit === frontendProduct.base_unit
                  ? { ...item, quantity: newTotalQuantity }
                  : item
              )
            );
          } else {
            setCart((prev) => [
              ...prev,
              { product: frontendProduct, quantity: normalizedQuantity, variation, unit: frontendProduct.base_unit },
            ]);
          }

          // Show success feedback
          const variationLabel = Object.entries(variation.attributes)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ");
          console.log(`✅ Added ${normalizedQuantity}x ${product.name} (${variationLabel}) via barcode`);
        } else {
          // It's a product SKU barcode
          if (frontendProduct.has_variations) {
            // Product has variations - open variation picker dialog
            setSelectedProductForVariation(frontendProduct);
            setQuantityForVariation(String(normalizedQuantity));
            setSelectedUnit(frontendProduct.base_unit);
            setVariationPriceOverrideEnabled(false);
            setSelectedVariation(null);
            setVariationDialogOpen(true);
          } else {
            // Product without variations - also open variation picker dialog
            setSelectedProductForVariation(frontendProduct);
            setQuantityForVariation(String(normalizedQuantity));
            setSelectedUnit(frontendProduct.base_unit);
            setVariationPriceOverrideEnabled(false);
            setSelectedVariation(null);
            setVariationDialogOpen(true);
          }
        }

        return true; // Successfully handled
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Barcode not found - return false to allow normal search
          return false;
        }
        console.error("Barcode lookup error:", error);
        return false;
      }
    },
    [cart, normalizeQuantityForProduct, shouldShowUnitDialog]
  );

  const handleSearchKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        if (!showAutocomplete || filteredProducts.length === 0) return;
        e.preventDefault();
        setSelectedProductIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        if (!showAutocomplete || filteredProducts.length === 0) return;
        e.preventDefault();
        setSelectedProductIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();

        // First, try barcode lookup if search looks like a barcode (exact match)
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery) {
          // Extract quantity if present (e.g., "BARCODE123 x 5" or "3 BARCODE123")
          const { searchTerm, quantity } = parseQuantityFromSearch(trimmedQuery);
          
          // Try barcode lookup first
          const handled = await lookupAndAddByBarcode(searchTerm, quantity);
          
          if (handled) {
            // Barcode found and added to cart
            setSearchQuery("");
            setShowAutocomplete(false);
            return;
          }
        }

        // If no barcode match or barcode lookup failed, use normal product selection
        if (showAutocomplete && filteredProducts.length > 0) {
          const selectedProduct = filteredProducts[selectedProductIndex];
          if (selectedProduct) {
            const { quantity } = parseQuantityFromSearch(searchQuery);
            addToCartWithQuantity(selectedProduct, quantity);
            setSearchQuery("");
            setShowAutocomplete(false);
          }
        }
      } else if (e.key === "Escape") {
        setShowAutocomplete(false);
      }
    },
    [
      showAutocomplete,
      filteredProducts,
      selectedProductIndex,
      parseQuantityFromSearch,
      searchQuery,
      addToCartWithQuantity,
      lookupAndAddByBarcode,
    ]
  );

  // Scroll the highlighted autocomplete item into view on keyboard navigation
  useEffect(() => {
    const list = autocompleteListRef.current;
    if (!list) return;
    // Each item is a direct child — there may be a hint banner at index 0
    const items = list.querySelectorAll<HTMLElement>(".autocomplete-item");
    const target = items[selectedProductIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [selectedProductIndex]);

  // Scroll the highlighted customer name item into view on keyboard navigation
  useEffect(() => {
    const list = customerNameListRef.current;
    if (!list) return;
    const items = list.querySelectorAll<HTMLElement>("button");
    const target = items[selectedCustomerNameIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [selectedCustomerNameIndex]);

  const handleCheckout = useCallback(() => {
    if (cart.length === 0) {
      alert("Cart is empty!");
      return;
    }
    setCheckoutOpen(true);
  }, [cart.length]);

  const amountPaidValue = useMemo(() => {
    const v = amountPaid.trim() === "" ? 0 : parseFloat(amountPaid);
    return Number.isFinite(v) ? v : 0;
  }, [amountPaid]);

  const handleSelectCustomerByName = useCallback((customer: CustomerSimple) => {
    skipNextCustomerLookupRef.current = true;
    setSelectedCustomer(customer);
    setCustomerName(customer.name || "");
    setCustomerPhone(customer.phone || "");
    setCustomerId(customer.customer_id || "");
    setCustomerNameResults([]);
    setShowCustomerNameResults(false);
  }, []);

  // --------------------------
  // Effects
  // --------------------------

  // Auth + initial fetch
  useEffect(() => {
    if (isLoading) return;

    if (!token) {
      router.push("/login");
      return;
    }

    void fetchTodayStats();
    void fetchHeldSales();
    void fetchProducts();
    fetchStoreConfig().then(setStoreInfo);
  }, [token, isLoading, router, fetchTodayStats, fetchHeldSales, fetchProducts]);

  // Debounced server search fetch
  useEffect(() => {
    if (isLoading || !token) return;

    const { searchTerm } = parseQuantityFromSearch(searchQuery);

    const timer = setTimeout(() => {
      void fetchProducts({
        search: searchTerm.trim() ? searchTerm : undefined,
        category: categoryFilter !== "All" ? categoryFilter : undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, categoryFilter, token, isLoading, parseQuantityFromSearch, fetchProducts]);

  // Focus search box
  useEffect(() => {
    if (!token || isLoading) return;

    const focusSearch = () => {
      if (!checkoutOpen && !variationDialogOpen && !unitDialogOpen) {
        productSearchInputRef.current?.focus();
      }
    };

    const t = window.setTimeout(focusSearch, 50);
    window.addEventListener("focus", focusSearch);
    document.addEventListener("visibilitychange", focusSearch);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("focus", focusSearch);
      document.removeEventListener("visibilitychange", focusSearch);
    };
  }, [token, isLoading, checkoutOpen, variationDialogOpen, unitDialogOpen]);

  // Local filter (autocomplete list)
  useEffect(() => {
    if (!searchQuery.trim() && categoryFilter === "All" && stockFilter === "all") {
      setFilteredProducts(products);
      setShowAutocomplete(false);
      return;
    }

    const { searchTerm } = parseQuantityFromSearch(searchQuery);
    const query = searchTerm.toLowerCase();

    let filtered = products;

    if (searchQuery.trim()) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.sku || "").toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
      );
    }

    if (categoryFilter !== "All") {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    if (stockFilter === "low") {
      filtered = filtered.filter((p) => p.quantity > 0 && p.quantity <= 10);
    } else if (stockFilter === "out") {
      filtered = filtered.filter((p) => p.quantity <= 0);
    } else if (stockFilter === "in") {
      filtered = filtered.filter((p) => p.quantity > 0);
    }

    setFilteredProducts(filtered);
    setShowAutocomplete(searchQuery.trim() !== "" && filtered.length > 0);
    setSelectedProductIndex(0);
  }, [searchQuery, products, categoryFilter, stockFilter, parseQuantityFromSearch]);

  // ✅ Debounced lookup when checkout is open and fields change
  useEffect(() => {
    if (!checkoutOpen) return;

    // Skip lookup if customer was just manually selected
    if (skipNextCustomerLookupRef.current) {
      skipNextCustomerLookupRef.current = false;
      return;
    }

    const t = setTimeout(() => {
      void handleCustomerLookup(customerPhone, customerId);
    }, 400);

    return () => clearTimeout(t);
  }, [customerPhone, customerId, checkoutOpen, handleCustomerLookup]);

  // Variation unit price auto-fill
  useEffect(() => {
    if (!selectedProductForVariation) {
      setVariationUnitPrice("");
      return;
    }

    let basePrice = selectedProductForVariation.selling_price;

    if (selectedVariation) {
      basePrice += selectedVariation.price_adjustment;
    }

    if (selectedUnit !== selectedProductForVariation.base_unit) {
      const sellingUnit = selectedProductForVariation.selling_units.find((u) => u.unit === selectedUnit);
      if (sellingUnit) basePrice = sellingUnit.price;
    }

    setVariationUnitPrice(basePrice.toFixed(2));
  }, [selectedProductForVariation, selectedVariation, selectedUnit]);

  useEffect(() => {
    if (!selectedProductForVariation) return;
    setVariationPriceOverrideEnabled(false);
  }, [selectedProductForVariation]);

  // Unit price auto-fill
  useEffect(() => {
    if (!selectedProductForUnit) {
      setUnitPriceOverride("");
      return;
    }

    let basePrice = selectedProductForUnit.selling_price;

    if (selectedUnitForRegular !== selectedProductForUnit.base_unit) {
      const sellingUnit = selectedProductForUnit.selling_units.find((u) => u.unit === selectedUnitForRegular);
      if (sellingUnit) basePrice = sellingUnit.price;
    }

    setUnitPriceOverride(basePrice.toFixed(2));
  }, [selectedProductForUnit, selectedUnitForRegular]);

  useEffect(() => {
    if (!selectedProductForUnit) return;
    setUnitPriceOverrideEnabled(false);
  }, [selectedProductForUnit]);

  // F4 or Space in Unit dialog - Add to cart
  useEffect(() => {
    if (!unitDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // F4 or Space key to add unit to cart
      if (e.key === "F4" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        void addUnitToCart();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [unitDialogOpen, addUnitToCart]);

  // F4 or Space in Variation dialog - Add to cart
  useEffect(() => {
    if (!variationDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // F4 or Space key to add variation to cart
      if (e.key === "F4" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        void addVariationToCart();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [variationDialogOpen, addVariationToCart]);

  // Ctrl+H hold, Ctrl+M checkout, Ctrl+E estimate, Ctrl+Space focus Amount Paid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;

      // Use e.code (physical key) so shortcuts work on macOS even when an input
      // is focused (WebKit remaps Ctrl+H→Backspace, Ctrl+M→Enter at the OS level)
      if (e.code === "KeyH") {
        e.preventDefault();
        void holdCurrentSale();
        return;
      }

      if (e.code === "KeyM") {
        e.preventDefault();
        handleCheckout();
        return;
      }

      if (e.code === "KeyE") {
        e.preventDefault();
        if (cart.length > 0) setEstimateOpen(true);
        return;
      }

      if (e.code === "Space") {
        if (!checkoutOpen) return;
        e.preventDefault();
        amountPaidInputRef.current?.focus();
        amountPaidInputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCheckout, holdCurrentSale, cart.length, checkoutOpen]);

  // keep snapshot for auto-hold
  useEffect(() => {
    latestSaleSnapshotRef.current = {
      cart,
      customerId,
      customerPhone,
      customerName,
      selectedCustomer,
      paymentMethod,
      discount,
      tax,
      deliveryCharges,
      amountPaid,
      token,
    };
  }, [
    cart,
    customerId,
    customerPhone,
    customerName,
    selectedCustomer,
    paymentMethod,
    discount,
    tax,
    deliveryCharges,
    amountPaid,
    token,
  ]);

  // auto-hold on tab close/visibility
  useEffect(() => {
    const handlePageHide = () => {
      autoHoldWithKeepAlive();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        autoHoldWithKeepAlive();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void autoHoldCurrentSale();
    };
  }, [autoHoldWithKeepAlive, autoHoldCurrentSale]);

  // ✅ Debounced name search for customers
  useEffect(() => {
    if (!checkoutOpen) return;

    const query = customerName.trim();
    if (query.length < 2) {
      setCustomerNameResults([]);
      setShowCustomerNameResults(false);
      return;
    }

    const requestId = ++customerNameLookupRequestIdRef.current;
    setCustomerNameLoading(true);

    const t = setTimeout(async () => {
      try {
        const results = await customerApi.getCustomers({ search: query, limit: 8 });
        if (requestId !== customerNameLookupRequestIdRef.current) return;

        setCustomerNameResults(results || []);
        setShowCustomerNameResults(true);
        setSelectedCustomerNameIndex(0); // Reset selection when results change
      } catch (error) {
        console.error("Customer name search failed:", error);
        if (requestId !== customerNameLookupRequestIdRef.current) return;

        setCustomerNameResults([]);
        setShowCustomerNameResults(false);
      } finally {
        if (requestId === customerNameLookupRequestIdRef.current) {
          setCustomerNameLoading(false);
        }
      }
    }, 350);

    return () => clearTimeout(t);
  }, [customerName, checkoutOpen]);

  const completeSale = useCallback(async () => {
    setLoading(true);
    try {
      const phoneVal = customerPhone.trim();
      const idValRaw = customerId.trim();
      const effectiveCustomerId = idValRaw ? idValRaw.toUpperCase() : phoneVal ? phoneVal : "";

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
        customer_id: effectiveCustomerId || null,
        customer_name: customerName || null,
        customer_phone: phoneVal || null,
        payment_method: paymentMethod,
        discount,
        tax,
        delivery_charges: deliveryCharges,
        amount_paid: amountPaidValue,
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          variation_id: item.variation?.id || null,
          unit: item.unit,
          item_discount: item.item_discount || 0,
          unit_price: typeof item.unit_price === "number" ? item.unit_price : undefined,
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

      void fetchProducts();
      void fetchTodayStats();
    } catch (error: any) {
      console.error("Failed to complete sale:", error);
      const detail: string = error.response?.data?.detail || "";
      const creditInfo = parseCreditLimitError(detail);
      if (creditInfo) {
        const amountDue = Math.max(
          0,
          (cart.reduce((s, i) => s + (i.unit_price ?? i.product.selling_price) * i.quantity, 0)) - amountPaidValue
        );
        setCreditLimitAlert({ ...creditInfo, attempted: amountDue });
      } else {
        alert(detail || "Failed to complete sale. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [
    cart,
    token,
    customerPhone,
    customerId,
    customerName,
    selectedCustomer,
    paymentMethod,
    discount,
    tax,
    deliveryCharges,
    amountPaidValue,
    clearCart,
    fetchProducts,
    fetchTodayStats,
  ]);

  const handleNewSale = useCallback(() => {
    setSuccessOpen(false);
    setSaleId(null);
    clearCart();
    
    // Auto-focus search bar for next sale
    setTimeout(() => productSearchInputRef.current?.focus(), 100);
  }, [clearCart]);

  // Get unique categories
  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(products.map((p) => p.category)))];
  }, [products]);

  // Calculate low stock count for tab label
  const lowStockCount = useMemo(() => {
    return products.filter((p) => p.quantity > 0 && p.quantity <= 10).length;
  }, [products]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sales Terminal</h1>
          <p className="text-muted-foreground">Cashier: {user?.username}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setSummaryOpen((prev) => !prev)}>
            {summaryOpen ? "Hide Summary" : "Show Summary"}
          </Button>
          <Card className="px-4 py-2">
            <p className="text-sm text-muted-foreground">Cart Items</p>
            <p className="text-2xl font-bold">{cart.length}</p>
          </Card>
        </div>
      </div>

      {summaryOpen && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today Total Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(todayStats.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">{todayStats.totalCount} sales</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today Sales (You)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(todayUserStats.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">{todayUserStats.totalCount} sales</p>
            </CardContent>
          </Card>

          <Card className={todayStats.totalUdhar > 0 ? "border-red-200 bg-red-50" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Today Udhar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${todayStats.totalUdhar > 0 ? "text-red-600" : ""}`}>
                {formatCurrency(todayStats.totalUdhar)}
              </div>
              <p className="text-xs text-muted-foreground">Outstanding due</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Cash</span>
                <span className="font-medium">{formatCurrency(todayStats.byPayment.cash || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Card</span>
                <span className="font-medium">{formatCurrency(todayStats.byPayment.card || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Mobile</span>
                <span className="font-medium">{formatCurrency(todayStats.byPayment.mobile || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Other</span>
                <span className="font-medium">{formatCurrency(todayStats.byPayment.other || 0)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {/* Main content area */}
        <div className="space-y-4">
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
              </div>

              {/* Search Input */}
              <div className="space-y-4">
                <div className="relative">
                  <Input
                    ref={productSearchInputRef}
                    placeholder="Search by name, SKU, barcode... (Try: milk x 1.5 or scan barcode)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => searchQuery && setShowAutocomplete(true)}
                    className="text-lg"
                  />

                  {showAutocomplete && filteredProducts.length > 0 && (
                    <div ref={autocompleteListRef} className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {(() => {
                        const { searchTerm, quantity } = parseQuantityFromSearch(searchQuery);
                        const selectedProduct = filteredProducts[selectedProductIndex];
                        const hintQty = selectedProduct
                          ? normalizeQuantityForProduct(selectedProduct, quantity)
                          : quantity;
                        const showQuantityHint =
                          searchTerm !== searchQuery && Math.abs(hintQty - 1) > 0.000001;

                        return (
                          <>
                            {showQuantityHint && (
                              <div className="bg-primary/10 px-3 py-2 border-b border-primary/20">
                                <p className="text-sm font-semibold text-primary">
                                  📦 Press Enter to add {hintQty} units of selected item
                                </p>
                              </div>
                            )}

                            {filteredProducts.slice(0, 10).map((product, index) => (
                              <div
                                key={product.id}
                                className={`autocomplete-item p-3 cursor-pointer border-b last:border-b-0 ${index === selectedProductIndex
                                    ? "bg-primary/10 border-l-4 border-l-primary"
                                    : "hover:bg-muted/50"
                                  }`}
                                onClick={() => {
                                  const { quantity } = parseQuantityFromSearch(searchQuery);
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
                                    <p className="font-bold text-primary">rs {product.selling_price.toFixed(2)}</p>
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
                                      {product.quantity > 0 ? product.quantity : "0 - Out of Stock"}
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
              </div>
            </CardContent>
          </Card>

          {/* Shopping Cart - Moved from right column */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Shopping Cart
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Cart is empty</p>
              ) : (
                <>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {cart.map((item, index) => {
                      let itemPrice =
                        typeof item.unit_price === "number" ? item.unit_price : item.product.selling_price;

                      if (item.variation && typeof item.unit_price !== "number") {
                        itemPrice += item.variation.price_adjustment;
                      }

                      if (item.unit !== item.product.base_unit && typeof item.unit_price !== "number") {
                        const sellingUnit = item.product.selling_units.find((u) => u.unit === item.unit);
                        if (sellingUnit) itemPrice = sellingUnit.price;
                      }

                      return (
                        <div
                          key={`${item.product.id}-${item.variation?.id || "base"}-${item.unit}`}
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

                            <div className="flex flex-wrap items-center gap-3 mt-2">
                              <div className="flex items-center gap-2">
                                <Label className="text-xs font-medium">Disc:</Label>
                                <div className="relative">
                                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                  <Input
                                    type="number"
                                    className="h-8 w-24 pl-7 text-sm"
                                    value={item.item_discount || ""}
                                    placeholder="0.00"
                                    min="0"
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setCart((prev) => {
                                        const next = [...prev];
                                        next[index] = { ...next[index], item_discount: val };
                                        return next;
                                      });
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span className="font-semibold">
                              rs {((itemPrice * item.quantity) - (item.item_discount || 0)).toFixed(2)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              rs {itemPrice.toFixed(2)}/{item.unit}
                              {typeof item.unit_price === "number" && (
                                <span className="ml-1 text-[10px] text-blue-600">(override)</span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                updateQuantity(index, item.quantity - (item.product.allow_decimal_qty ? 0.25 : 1))
                              }
                            >
                              <Minus className="h-3 w-3" />
                            </Button>

                            <span className="w-8 text-center font-medium">{item.quantity}</span>

                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                updateQuantity(index, item.quantity + (item.product.allow_decimal_qty ? 0.25 : 1))
                              }
                            >
                              <Plus className="h-3 w-3" />
                            </Button>

                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              title="Edit item details"
                              onClick={() => {
                                setEditingCartIndex(index);
                                
                                if (item.variation) {
                                  // Open variation dialog for editing
                                  setSelectedProductForVariation(item.product);
                                  setSelectedVariation(item.variation);
                                  setQuantityForVariation(String(item.quantity));
                                  setSelectedUnit(item.unit);
                                  setVariationDiscount(item.item_discount || 0);
                                  setVariationUnitPrice(typeof item.unit_price === "number" ? String(item.unit_price) : "");
                                  setVariationPriceOverrideEnabled(typeof item.unit_price === "number");
                                  setVariationDialogOpen(true);
                                } else {
                                  // Open variation dialog for non-variation products too
                                  setSelectedProductForVariation(item.product);
                                  setSelectedVariation(null);
                                  setQuantityForVariation(String(item.quantity));
                                  setSelectedUnit(item.unit);
                                  setVariationDiscount(item.item_discount || 0);
                                  setVariationUnitPrice(typeof item.unit_price === "number" ? String(item.unit_price) : "");
                                  setVariationPriceOverrideEnabled(typeof item.unit_price === "number");
                                  setVariationDialogOpen(true);
                                }
                              }}
                            >
                              <Settings className="h-3 w-3" />
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
                    <div className="flex justify-between font-semibold mt-2 pt-2 border-t">
                      <span>Subtotal</span>
                      <span>rs {calculateSubtotal().toFixed(2)}</span>
                    </div>

                    {(discount > 0 || calculateItemDiscounts() > 0) && (
                      <div className="flex justify-between text-red-600">
                        <span>Total Discount</span>
                        <span>-rs {(discount + calculateItemDiscounts()).toFixed(2)}</span>
                      </div>
                    )}

                    {(discount > 0 || calculateItemDiscounts() > 0) && (
                      <div className="flex justify-between font-semibold border-t pt-2">
                        <span>After Discount</span>
                        <span>rs {(calculateSubtotal() - discount - calculateItemDiscounts()).toFixed(2)}</span>
                      </div>
                    )}

                    {tax > 0 && (
                      <div className="flex justify-between">
                        <span>Tax</span>
                        <span>+rs {tax.toFixed(2)}</span>
                      </div>
                    )}

                    {deliveryCharges > 0 && (
                      <div className="flex justify-between">
                        <span>Delivery</span>
                        <span>+rs {deliveryCharges.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between font-bold text-lg pt-2 border-t-2 mt-2">
                      <span>Total to Charge</span>
                      <span>rs {calculateTotal().toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button className="w-full" size="lg" onClick={handleCheckout}>
                      <DollarSign className="h-5 w-5 mr-2" />
                      Checkout (Ctrl+M)
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" className="w-full" onClick={() => void holdCurrentSale()}>
                        Hold (Ctrl+H)
                      </Button>
                      <Button variant="outline" className="w-full" onClick={() => setEstimateOpen(true)}>
                        <Printer className="h-4 w-4 mr-1" />
                        Estimate (Ctrl+E)
                      </Button>
                    </div>
                    <Button variant="outline" className="w-full" onClick={clearCart}>
                      Clear Cart
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Held Bills - Moved from right column */}
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Held Bills
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{heldSales.length}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setHeldOpen((prev) => !prev)}>
                    {heldOpen ? "Hide" : "Show"}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>

            {heldOpen && (
              <CardContent className="space-y-3 max-h-[260px] overflow-y-auto">
                {heldSales.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-6">No held bills</div>
                ) : (
                  heldSales.map((hold) => (
                    <div key={hold.id} className="border rounded-md p-3 bg-background/50">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{hold.label || "Walk-in"}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(hold.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-red-600 px-2 py-1 text-sm font-bold text-white">
                            {formatCurrency(calculateHeldTotal(hold))}
                          </span>
                          <Button size="sm" onClick={() => void resumeHeldSale(hold)}>
                            Resume
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void deleteHeldSale(hold.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>

          {/* Products List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <PackageIcon className="h-4 w-4 text-muted-foreground" />
                  Products List
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{filteredProducts.length}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setProductsListOpen((prev) => !prev)}>
                    {productsListOpen ? "Hide" : "Show"}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>

            {productsListOpen && (
              <CardContent className="p-0">
                <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-muted sticky top-0">
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Name</th>
                      <th className="text-right p-3 font-semibold">Price</th>
                      <th className="text-center p-3 font-semibold">Stock</th>
                      <th className="text-center p-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center p-8 text-muted-foreground">
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
                          <td className="p-3 text-right font-semibold text-primary">
                            rs {product.selling_price.toFixed(2)}
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
                              {product.quantity > 0 ? product.quantity : "0 - Out of Stock"}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              size="sm"
                              disabled={product.quantity <= 0}
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
            )}
          </Card>
        </div>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Complete Sale</DialogTitle>
            <DialogDescription>Enter customer and payment details to complete the transaction.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4 px-1 relative">
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone Number</Label>
              <Input
                id="customerPhone"
                placeholder="e.g., 0300xxxxxxx"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>

            {customerSearchLoading && (
              <div className="absolute right-6 top-6">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
              </div>
            )}

            {selectedCustomer && (
              <div className={`p-2 border rounded text-sm ${
                selectedCustomer.outstanding_balance < 0 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-green-800">{selectedCustomer.name || "Customer"}</p>
                    <p className="text-xs text-green-600">
                      {selectedCustomer.customer_id && `ID: ${selectedCustomer.customer_id}`}
                      {selectedCustomer.phone && ` • Phone: ${selectedCustomer.phone}`}
                    </p>
                  </div>
                  {selectedCustomer.outstanding_balance > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      Udhar: rs {selectedCustomer.outstanding_balance.toFixed(2)}
                    </Badge>
                  )}
                  {selectedCustomer.outstanding_balance < 0 && (
                    <Badge variant="default" className="text-xs bg-green-600">
                      Credit: +rs {Math.abs(selectedCustomer.outstanding_balance).toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {!selectedCustomer && (customerId.trim() || customerPhone.trim()) && !customerSearchLoading && (
              <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                <p className="text-blue-800 font-medium mb-1">New customer will be created:</p>
                {customerId.trim() && (
                  <p>
                    ID: <b>{customerId.trim().toUpperCase()}</b>
                  </p>
                )}
                {customerPhone.trim() && (
                  <p>
                    Phone: <b>{customerPhone.trim()}</b>
                  </p>
                )}
              </div>
            )}

            {!customerId.trim() && !customerPhone.trim() && (
              <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 font-medium">
                Walk-in sale (no customer linked)
              </div>
            )}

            <div className="space-y-1 relative">
              <Label htmlFor="customer" className="text-sm">
                Customer Name (Search / Optional)
              </Label>
              <Input
                id="customer"
                placeholder="Type a name to search"
                value={customerName}
                onChange={(e) => {
                  const value = e.target.value;
                  setCustomerName(value);

                  if (selectedCustomer && value !== (selectedCustomer.name || "")) {
                    setSelectedCustomer(null);
                  }
                  if (value.trim().length >= 2) {
                    setShowCustomerNameResults(true);
                  } else {
                    setShowCustomerNameResults(false);
                  }
                }}
                onFocus={() => {
                  if (customerName.trim().length >= 2) setShowCustomerNameResults(true);
                }}
                onBlur={() => {
                  setTimeout(() => setShowCustomerNameResults(false), 150);
                }}
                onKeyDown={(e) => {
                  if (!showCustomerNameResults || customerNameResults.length === 0) return;

                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedCustomerNameIndex((prev) =>
                      prev < customerNameResults.length - 1 ? prev + 1 : prev
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedCustomerNameIndex((prev) => (prev > 0 ? prev - 1 : 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (customerNameResults[selectedCustomerNameIndex]) {
                      handleSelectCustomerByName(customerNameResults[selectedCustomerNameIndex]);
                    }
                  } else if (e.key === "Escape") {
                    setShowCustomerNameResults(false);
                  }
                }}
              />

              {customerNameLoading && (
                <div className="absolute right-3 top-9">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                </div>
              )}

              {showCustomerNameResults && customerNameResults.length > 0 && (
                <div 
                  ref={customerNameListRef}
                  className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto"
                >
                  {customerNameResults.map((cust, index) => (
                    <button
                      key={cust.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        index === selectedCustomerNameIndex
                          ? "bg-blue-50 border-l-2 border-blue-500"
                          : "hover:bg-gray-50"
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setSelectedCustomerNameIndex(index)}
                      onClick={() => handleSelectCustomerByName(cust)}
                    >
                      <div className="font-medium text-gray-900">{cust.name || "Customer"}</div>
                      <div className="text-xs text-gray-500">
                        {cust.customer_id ? `ID: ${cust.customer_id}` : ""}
                        {cust.phone ? ` • ${cust.phone}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showCustomerNameResults && customerNameResults.length === 0 && !customerNameLoading && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg px-3 py-2 text-xs text-gray-500">
                  No customers found
                </div>
              )}
            </div>

            {/* Delivery Charges */}
            <div className="space-y-1 pt-2">
              <Label htmlFor="delivery" className="text-sm">
                Delivery Charges (rs)
              </Label>
              <Input
                id="delivery"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={deliveryCharges || ""}
                onChange={(e) => setDeliveryCharges(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="payment" className="text-sm">
                Payment Method
              </Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment" className="h-8 text-sm">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="discount" className="text-sm">
                  Global Discount (rs)
                </Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tax" className="text-sm">
                  Tax (rs)
                </Label>
                <Input
                  id="tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tax}
                  onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                  className="text-xs h-8"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="amountPaid" className="text-sm">
                Amount Paid (rs)
              </Label>
              <Input
                ref={amountPaidInputRef}
                id="amountPaid"
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="text-sm font-semibold h-8"
              />
              <p className="text-xs text-muted-foreground">Amount received from customer</p>
            </div>

            <div className="border-t pt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>rs {calculateSubtotal().toFixed(2)}</span>
              </div>

              {(discount > 0 || calculateItemDiscounts() > 0) && (
                <div className="flex justify-between text-red-600">
                  <span>Total Discount:</span>
                  <span>-rs {(discount + calculateItemDiscounts()).toFixed(2)}</span>
                </div>
              )}

              {(discount > 0 || calculateItemDiscounts() > 0) && (
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>After Discount:</span>
                  <span>rs {(calculateSubtotal() - discount - calculateItemDiscounts()).toFixed(2)}</span>
                </div>
              )}

              {tax > 0 && (
                <div className="flex justify-between">
                  <span>Tax:</span>
                  <span>+rs {tax.toFixed(2)}</span>
                </div>
              )}

              {deliveryCharges > 0 && (
                <div className="flex justify-between">
                  <span>Delivery:</span>
                  <span>+rs {deliveryCharges.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between font-bold border-t-2 pt-1 mt-1">
                <span>TOTAL TO CHARGE:</span>
                <span className="text-lg">rs {calculateTotal().toFixed(2)}</span>
              </div>

              {amountPaidValue < calculateTotal() && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Due (Udhar):</span>
                  <span>rs {(calculateTotal() - amountPaidValue).toFixed(2)}</span>
                </div>
              )}

              {amountPaidValue > calculateTotal() && (
                <div className="flex justify-between text-green-600 font-semibold">
                  <span>Change:</span>
                  <span>rs {(amountPaidValue - calculateTotal()).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="bg-primary/10 p-2 rounded border border-primary/20">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm">Amount Paid:</span>
                <span className="text-xl font-bold text-primary">rs {amountPaidValue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setCheckoutOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={() => void completeSale()} disabled={loading}>
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
            <DialogDescription>The sale has been successfully processed.</DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            <div className="text-center pb-4 border-b">
              <p className="text-sm text-muted-foreground mb-1">Sale ID</p>
              <p className="text-2xl font-bold">#{saleId}</p>
            </div>

            <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Sale:</span>
                <span className="text-xl font-bold text-primary">rs {completedSaleTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Amount Paid:</span>
                <span className="text-xl font-semibold text-green-600">
                  rs {completedAmountPaid.toFixed(2)}
                </span>
              </div>

              {completedChange > 0 && (
                <div className="flex justify-between items-center pt-3 border-t-2 border-green-600">
                  <span className="text-base font-bold text-green-700">Change to Return:</span>
                  <span className="text-3xl font-bold text-green-700">rs {completedChange.toFixed(2)}</span>
                </div>
              )}

              {completedAmountPaid < completedSaleTotal && (
                <div className="flex justify-between items-center pt-3 border-t-2 border-red-600">
                  <span className="text-base font-bold text-red-700">Amount Due (Udhar):</span>
                  <span className="text-3xl font-bold text-red-700">
                    rs {(completedSaleTotal - completedAmountPaid).toFixed(2)}
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
              {selectedProductForVariation?.has_variations ? "Select Variation" : "Product Details"} - {selectedProductForVariation?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedProductForVariation?.has_variations 
                ? "Choose the specific variation and quantity (Press F4 or Space to add to cart)"
                : "Configure quantity and options (Press F4 or Space to add to cart)"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Product Info */}
            {selectedProductForVariation && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="text-sm font-medium text-blue-900 mb-1">Product Info</div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Base Price:</span>
                  <span className="font-semibold text-blue-900">
                    rs {selectedProductForVariation.selling_price.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-muted-foreground">Stock:</span>
                  <span className="font-medium">
                    {selectedProductForVariation.quantity} {selectedProductForVariation.base_unit}
                  </span>
                </div>
              </div>
            )}

            {selectedProductForVariation?.has_variations && selectedProductForVariation?.variations && selectedProductForVariation.variations.length > 0 ? (
              <div className="grid gap-2">
                <Label>Select Variation</Label>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {selectedProductForVariation.variations.map((variation) => {
                    const finalPrice = selectedProductForVariation.selling_price + variation.price_adjustment;
                    return (
                      <button
                        key={variation.id}
                        onClick={() => { setSelectedVariation(variation); setTimeout(() => quantityForVariationInputRef.current?.focus(), 0); }}
                        className={`p-3 border rounded text-left transition-all ${selectedVariation?.id === variation.id ? "border-blue-500 bg-blue-50" : "hover:border-gray-400"
                          } ${variation.quantity <= 0 ? "opacity-50" : ""}`}
                        disabled={variation.quantity <= 0}
                      >
                        <div className="font-medium">
                          {Object.entries(variation.attributes)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          rs {finalPrice.toFixed(2)} • Stock: {variation.quantity > 0 ? variation.quantity : "0 - Out of Stock"}
                        </div>
                        {variation.quantity <= 0 && <div className="text-xs text-red-600">Out of stock</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : selectedProductForVariation?.has_variations ? (
              <div className="text-center text-muted-foreground py-4">
                No variations available. Please add variations in inventory management.
              </div>
            ) : null}

            {selectedProductForVariation && (selectedVariation || !selectedProductForVariation.has_variations) && (
              <>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md group">
                  <div className="text-sm font-medium text-blue-900 mb-1">Pricing Information</div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Buying Price:</span>
                    <span className="font-medium text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      rs {selectedProductForVariation.cost_price?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-muted-foreground">Selling Price:</span>
                    <span className="font-semibold text-primary">
                      rs {selectedVariation 
                        ? (selectedProductForVariation.selling_price + selectedVariation.price_adjustment).toFixed(2)
                        : selectedProductForVariation.selling_price.toFixed(2)}
                    </span>
                  </div>
                </div>

                {selectedProductForVariation.selling_units && selectedProductForVariation.selling_units.length > 0 && (
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
                            {unit.unit} (×{unit.conversion}) - rs {unit.price.toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="grid gap-2">
              <Label>Quantity</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="variationDecimalEnabled"
                  checked={Boolean(selectedProductForVariation?.allow_decimal_qty)}
                  disabled
                />
                <Label htmlFor="variationDecimalEnabled" className="text-xs text-muted-foreground">
                  Points/decimal quantity enabled for this product
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const step = selectedProductForVariation?.allow_decimal_qty ? 0.25 : 1;
                    const current = parseDraftQuantity(quantityForVariation) ?? 0;
                    const next = Math.max(0, current - step);
                    setQuantityForVariation(String(next));
                  }}
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Input
                  type="number"
                  min="0"
                  step={selectedProductForVariation?.allow_decimal_qty ? "0.25" : "1"}
                  value={quantityForVariation}
                  onChange={(e) => setQuantityForVariation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addVariationToCart(); } }}
                  className="text-center"
                  autoFocus
                  ref={quantityForVariationInputRef}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const step = selectedProductForVariation?.allow_decimal_qty ? 0.25 : 1;
                    const current = parseDraftQuantity(quantityForVariation) ?? 0;
                    setQuantityForVariation(String(current + step));
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="variationDiscount">Item Discount (rs)</Label>
              <Input
                id="variationDiscount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={variationDiscount || ""}
                onChange={(e) => setVariationDiscount(parseFloat(e.target.value) || 0)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addVariationToCart(); } }}
              />
              <p className="text-xs text-muted-foreground">Discount to apply on this item</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="variationUnitPrice">Selling Price (rs)</Label>
              <Input
                id="variationUnitPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={variationUnitPrice}
                onChange={(e) => setVariationUnitPrice(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addVariationToCart(); } }}
                disabled={!variationPriceOverrideEnabled}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="variationPriceOverrideEnabled"
                  checked={variationPriceOverrideEnabled}
                  onCheckedChange={(checked) => setVariationPriceOverrideEnabled(Boolean(checked))}
                />
                <Label htmlFor="variationPriceOverrideEnabled" className="text-xs text-muted-foreground">
                  Update price in database
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">Override price for the selected unit</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVariationDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => void addVariationToCart()} 
              disabled={selectedProductForVariation?.has_variations && !selectedVariation}
            >
              Add to Cart <span className="ml-2 text-xs opacity-70">(F4/Space)</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unit Picker Dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Unit - {selectedProductForUnit?.name}</DialogTitle>
            <DialogDescription>Choose how you want to sell this product (Press F4 or Space to add to cart)</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedProductForUnit && (
              <>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md group">
                  <div className="text-sm font-medium text-blue-900 mb-1">Pricing Information</div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Buying Price:</span>
                    <span className="font-medium text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      rs {selectedProductForUnit.cost_price?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-muted-foreground">Selling Price:</span>
                    <span className="font-semibold text-primary">rs {selectedProductForUnit.selling_price.toFixed(2)}</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Selling Unit</Label>
                  <Select value={selectedUnitForRegular} onValueChange={setSelectedUnitForRegular}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={selectedProductForUnit.base_unit}>
                        {selectedProductForUnit.base_unit} (Base unit) - rs {selectedProductForUnit.selling_price.toFixed(2)}
                      </SelectItem>
                      {selectedProductForUnit.selling_units.map((unit) => (
                        <SelectItem key={unit.unit} value={unit.unit}>
                          {unit.unit} (×{unit.conversion}) - rs {unit.price.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label>Quantity</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="unitDecimalEnabled"
                  checked={Boolean(selectedProductForUnit?.allow_decimal_qty)}
                  disabled
                />
                <Label htmlFor="unitDecimalEnabled" className="text-xs text-muted-foreground">
                  Points/decimal quantity enabled for this product
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const step = selectedProductForUnit?.allow_decimal_qty ? 0.25 : 1;
                    const current = parseDraftQuantity(quantityForUnit) ?? 0;
                    const next = Math.max(0, current - step);
                    setQuantityForUnit(String(next));
                  }}
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Input
                  type="number"
                  min="0"
                  step={selectedProductForUnit?.allow_decimal_qty ? "0.25" : "1"}
                  value={quantityForUnit}
                  onChange={(e) => setQuantityForUnit(e.target.value)}
                  className="text-center"
                />

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const step = selectedProductForUnit?.allow_decimal_qty ? 0.25 : 1;
                    const current = parseDraftQuantity(quantityForUnit) ?? 0;
                    setQuantityForUnit(String(current + step));
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="unitDiscount">Item Discount (rs)</Label>
              <Input
                id="unitDiscount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={unitDiscount || ""}
                onChange={(e) => setUnitDiscount(parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Discount to apply on this item</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="unitPriceOverride">Selling Price (rs)</Label>
              <Input
                id="unitPriceOverride"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={unitPriceOverride}
                onChange={(e) => setUnitPriceOverride(e.target.value)}
                disabled={!unitPriceOverrideEnabled}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="unitPriceOverrideEnabled"
                  checked={unitPriceOverrideEnabled}
                  onCheckedChange={(checked) => setUnitPriceOverrideEnabled(Boolean(checked))}
                />
                <Label htmlFor="unitPriceOverrideEnabled" className="text-xs text-muted-foreground">
                  Update price in database
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">Override price for the selected unit</p>
            </div>

            {selectedProductForUnit && (
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm">
                  <span className="font-medium">Available Stock:</span> {selectedProductForUnit.quantity}{" "}
                  {selectedProductForUnit.base_unit}
                </div>

                {selectedUnitForRegular !== selectedProductForUnit.base_unit && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {quantityForUnit} {selectedUnitForRegular} ={" "}
                    {(parseDraftQuantity(quantityForUnit) || 0) *
                      (selectedProductForUnit.selling_units.find((u) => u.unit === selectedUnitForRegular)?.conversion ||
                        1)}{" "}
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
            <Button onClick={() => void addUnitToCart()}>Add to Cart <span className="ml-2 text-xs opacity-70">(F4/Space)</span></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Limit Alert */}
      {creditLimitAlert && (
        <CreditLimitAlert
          open={!!creditLimitAlert}
          onClose={() => setCreditLimitAlert(null)}
          customerName={selectedCustomer?.name || customerName || undefined}
          limit={creditLimitAlert.limit}
          current={creditLimitAlert.current}
          available={creditLimitAlert.available}
          attempted={creditLimitAlert.attempted}
        />
      )}

      {/* Estimate / Quotation Dialog */}
      <Dialog open={estimateOpen} onOpenChange={setEstimateOpen}>
        <DialogContent className="sm:max-w-[420px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Estimate / Quotation</DialogTitle>
            <DialogDescription>
              Preview-only quote. Nothing is saved or deducted from stock.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2">
            {/* Printable estimate content */}
            <div id="estimate-print-area" className="text-sm font-mono space-y-1 px-1">
              {/* Store header */}
              <div className="text-center border-b-2 border-dashed pb-2 mb-2">
                <p className="font-bold text-base">{storeInfo.name}</p>
                {storeInfo.address && <p className="text-xs">{storeInfo.address}</p>}
                {storeInfo.city && <p className="text-xs">{storeInfo.city}</p>}
                {storeInfo.phone && <p className="text-xs">{storeInfo.phone}</p>}
              </div>

              {/* Label */}
              <div className="text-center mb-2 pb-2 border-b border-dashed">
                <p className="font-bold text-lg tracking-widest">ESTIMATE</p>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleString("en-US", {
                    year: "numeric", month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                <p className="text-xs text-muted-foreground">Prepared by: {user?.username}</p>
              </div>

              {/* Items */}
              <div className="space-y-2 border-b border-dashed pb-2 mb-2">
                {cart.map((item) => {
                  let itemPrice =
                    typeof item.unit_price === "number"
                      ? item.unit_price
                      : item.product.selling_price;
                  if (item.variation && typeof item.unit_price !== "number")
                    itemPrice += item.variation.price_adjustment;
                  if (item.unit !== item.product.base_unit && typeof item.unit_price !== "number") {
                    const su = item.product.selling_units.find((u) => u.unit === item.unit);
                    if (su) itemPrice = su.price;
                  }
                  const lineTotal = itemPrice * item.quantity - (item.item_discount || 0);
                  return (
                    <div key={`${item.product.id}-${item.variation?.id || "base"}-${item.unit}`}>
                      <div className="flex justify-between">
                        <span className="font-medium flex-1 pr-2">{item.product.name}</span>
                        <span>rs {lineTotal.toFixed(2)}</span>
                      </div>
                      {item.variation && (
                        <p className="text-xs text-purple-600 pl-2">
                          {Object.entries(item.variation.attributes).map(([k, v]) => `${k}: ${v}`).join(", ")}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground pl-2">
                        {item.quantity} {item.unit} × rs {itemPrice.toFixed(2)}
                        {(item.item_discount || 0) > 0 && ` – disc rs ${(item.item_discount || 0).toFixed(2)}`}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Totals */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>rs {calculateSubtotal().toFixed(2)}</span>
                </div>
                {(discount > 0 || calculateItemDiscounts() > 0) && (
                  <div className="flex justify-between text-red-600">
                    <span>Total Discount</span>
                    <span>-rs {(discount + calculateItemDiscounts()).toFixed(2)}</span>
                  </div>
                )}
                {(discount > 0 || calculateItemDiscounts() > 0) && (
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>Price After Discount</span>
                    <span>rs {(calculateSubtotal() - discount - calculateItemDiscounts()).toFixed(2)}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>+rs {tax.toFixed(2)}</span>
                  </div>
                )}
                {deliveryCharges > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span>+rs {deliveryCharges.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t-2 pt-1 mt-1">
                  <span>TOTAL TO BE CHARGED</span>
                  <span>rs {calculateTotal().toFixed(2)}</span>
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground pt-3 border-t border-dashed mt-3">
                This is an estimate only — not a tax invoice.
              </p>
            </div>
          </div>

          <DialogFooter className="border-t pt-3 gap-2">
            <Button variant="outline" onClick={() => setEstimateOpen(false)}>
              Close
            </Button>
            <Button onClick={() => {
              document.body.classList.add("print-estimate");
              window.print();
              document.body.classList.remove("print-estimate");
            }}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
