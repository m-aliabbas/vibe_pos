"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  Check,
  ChevronsUpDown,
  Loader2,
  PackageCheck,
  PackageX,
  Play,
  Search,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import AdminRouteGuard from "@/components/AdminRouteGuard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsOverviewReport, ProductSalesHistoryReport, reportsApi } from "@/lib/api";

interface ProductOption {
  id: number;
  name: string;
  sku?: string | null;
  category?: string | null;
  company?: string | null;
}

interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

const currency = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

const quantity = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });
const PRODUCT_REPORT_PAGE_SIZE = 100;

function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-slate-500">{message}</div>;
}

function Rank({ value, tone = "blue" }: { value: number; tone?: "blue" | "amber" | "rose" }) {
  const classes = {
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
  };
  return <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${classes[tone]}`}>{value}</span>;
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [topN, setTopN] = useState("5");
  const [months, setMonths] = useState("6");
  const [data, setData] = useState<AnalyticsOverviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productFilterOptions, setProductFilterOptions] = useState<{ categories: string[]; companies: string[] }>({ categories: [], companies: [] });
  const [productSearch, setProductSearch] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<ProductOption[]>([]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [productPeriod, setProductPeriod] = useState("30");
  const [productStartDate, setProductStartDate] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [productEndDate, setProductEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [productReport, setProductReport] = useState<ProductSalesHistoryReport | null>(null);
  const [productReportLoading, setProductReportLoading] = useState(false);
  const [productReportError, setProductReportError] = useState<string | null>(null);
  const [productReportPage, setProductReportPage] = useState(1);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await reportsApi.getAnalyticsOverview({
        start_date: startDate,
        end_date: endDate,
        top_n: Number(topN),
        months: Number(months),
      });
      setData(report);
    } catch (requestError) {
      console.error("Failed to load analytics:", requestError);
      setError("Analytics could not be loaded. Check the backend connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [endDate, months, startDate, topN]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    reportsApi.getProductFilterOptions()
      .then(setProductFilterOptions)
      .catch((requestError) => console.error("Failed to load product filters:", requestError));
  }, []);

  useEffect(() => {
    const normalized = productSearch.trim();
    if (normalized.length < 2) {
      setProductSuggestions([]);
      setProductOptionsLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setProductOptionsLoading(true);
      reportsApi.getProductOptions(normalized, 50)
        .then((options) => {
          if (active) setProductSuggestions(options);
        })
        .catch((requestError) => console.error("Failed to search products:", requestError))
        .finally(() => { if (active) setProductOptionsLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [productSearch]);

  const loadProductReport = useCallback(async (page: number) => {
    setProductReportLoading(true);
    setProductReportError(null);
    setProductReport(null);
    try {
      const report = await reportsApi.getProductSalesHistory({
        start_date: productStartDate,
        end_date: productEndDate,
        product_ids: selectedProducts.map((item) => item.id).join(',') || undefined,
        categories: selectedCategories.join(',') || undefined,
        companies: selectedCompanies.join(',') || undefined,
        skip: (page - 1) * PRODUCT_REPORT_PAGE_SIZE,
        max_products: PRODUCT_REPORT_PAGE_SIZE,
      });
      setProductReport(report);
      setProductReportPage(page);
    } catch (requestError) {
      console.error("Failed to load product report:", requestError);
      setProductReportError("The product report could not be loaded. Please narrow the filters and try again.");
    } finally {
      setProductReportLoading(false);
    }
  }, [productEndDate, productStartDate, selectedCategories, selectedCompanies, selectedProducts]);

  const updateProductPeriod = (value: string) => {
    setProductPeriod(value);
    setProductReportPage(1);
    setProductReport(null);
    setProductReportError(null);
    if (value === "custom") return;
    const today = new Date();
    const start = value === "year"
      ? new Date(today.getFullYear(), 0, 1)
      : subDays(today, Math.max(0, Number(value) - 1));
    setProductStartDate(format(start, "yyyy-MM-dd"));
    setProductEndDate(format(today, "yyyy-MM-dd"));
  };

  const selectableProducts = useMemo<MultiSelectOption[]>(() => {
    const options = new Map<number, ProductOption>();
    [...selectedProducts, ...productSuggestions].forEach((item) => options.set(item.id, item));
    return Array.from(options.values()).map((item) => ({
      value: String(item.id),
      label: item.name,
      description: [item.sku, item.company || item.category].filter(Boolean).join(" · "),
    }));
  }, [productSuggestions, selectedProducts]);

  const productDatesInvalid = !productStartDate || !productEndDate || productStartDate > productEndDate;
  const productReportTotalPages = productReport
    ? Math.max(1, Math.ceil(productReport.total_matching_products / PRODUCT_REPORT_PAGE_SIZE))
    : 1;

  const summary = useMemo(() => ({
    stockAttention: (data?.low_stock_count || 0) + (data?.out_of_stock_count || 0),
    vendorPayable: data?.outstanding_vendors.reduce((sum, item) => sum + item.outstanding_amount, 0) || 0,
    customerReceivable: data?.outstanding_customers.reduce((sum, item) => sum + item.outstanding_amount, 0) || 0,
    periodRevenue: data?.monthly_sales.at(-1)?.revenue || 0,
  }), [data]);

  return (
    <AdminRouteGuard>
      <div className="h-full overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-200">
                  <BarChart3 className="h-4 w-4" /> Business intelligence
                </div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Reports & Analytics</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
                  Stock risks, product demand, vendor pricing, payables, and customer value in one focused dashboard.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="report-start" className="text-xs text-slate-300">From</Label>
                  <Input id="report-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="border-white/20 bg-white text-slate-950" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="report-end" className="text-xs text-slate-300">To</Label>
                  <Input id="report-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="border-white/20 bg-white text-slate-950" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Show Top</Label>
                  <Select value={topN} onValueChange={setTopN}>
                    <SelectTrigger className="w-full border-white/20 bg-white text-slate-950"><SelectValue /></SelectTrigger>
                    <SelectContent>{[5, 10, 15, 20].map((item) => <SelectItem key={item} value={String(item)}>{item} records</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Trend</Label>
                  <Select value={months} onValueChange={setMonths}>
                    <SelectTrigger className="w-full border-white/20 bg-white text-slate-950"><SelectValue /></SelectTrigger>
                    <SelectContent>{[3, 6, 12, 18, 24].map((item) => <SelectItem key={item} value={String(item)}>{item} months</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Unable to load reports</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>{error}</span><Button variant="outline" size="sm" onClick={fetchAnalytics}>Try again</Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Stock needs attention", value: summary.stockAttention, note: `${data?.out_of_stock_count || 0} out of stock`, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "Vendor payables", value: currency.format(summary.vendorPayable), note: `Top ${topN} outstanding`, icon: WalletCards, color: "text-rose-600", bg: "bg-rose-50" },
              { label: "Customer receivables", value: currency.format(summary.customerReceivable), note: `Top ${topN} outstanding`, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Latest month sales", value: currency.format(summary.periodRevenue), note: `${months}-month trend`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
            ].map(({ label, value, note, icon: Icon, color, bg }) => (
              <Card key={label} className="border-0 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{loading ? "—" : value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>
                  <div className={`rounded-xl p-3 ${bg}`}><Icon className={`h-6 w-6 ${color}`} /></div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="inventory" className="space-y-5">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-5">
              <TabsTrigger value="inventory" className="gap-2 py-2.5"><Boxes className="h-4 w-4" /> Inventory</TabsTrigger>
              <TabsTrigger value="products" className="gap-2 py-2.5"><ShoppingBag className="h-4 w-4" /> Products</TabsTrigger>
              <TabsTrigger value="buying" className="gap-2 py-2.5"><Truck className="h-4 w-4" /> Buying</TabsTrigger>
              <TabsTrigger value="customers" className="gap-2 py-2.5"><Users className="h-4 w-4" /> Customers</TabsTrigger>
              <TabsTrigger value="staff" className="gap-2 py-2.5"><UserCog className="h-4 w-4" /> Staff</TabsTrigger>
            </TabsList>

            <TabsContent value="inventory" className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-2">
                <StockCard title="Low stock products" description="In stock, but at or below the reorder threshold" icon={AlertTriangle} tone="amber" rows={data?.low_stock || []} total={data?.low_stock_count || 0} loading={loading} />
                <StockCard title="Out of stock" description="Products with no available stock" icon={PackageCheck} tone="rose" rows={data?.out_of_stock || []} total={data?.out_of_stock_count || 0} loading={loading} />
              </div>
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><PackageX className="h-5 w-5 text-rose-600" /> Expired products <Badge variant="destructive" className="ml-auto">{data?.expired_batch_count || 0}</Badge></CardTitle>
                  <CardDescription>Active batches with stock remaining after their expiry date</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="pb-3">Product</th><th className="pb-3">Batch</th><th className="pb-3">Expiry</th><th className="pb-3 text-right">Expired by</th><th className="pb-3 text-right">Remaining</th><th className="pb-3 text-right">Stock value</th></tr></thead>
                      <tbody>{data?.expired_batches.map((item) => <tr key={item.batch_id} className="border-b border-slate-100 last:border-0"><td className="py-3"><p className="font-medium">{item.product_name}</p><p className="text-xs text-slate-500">{item.company || item.category || item.sku || "—"}</p></td><td className="py-3 font-mono text-xs">{item.batch_number}</td><td className="py-3">{format(new Date(item.expiry_date), "dd MMM yyyy")}</td><td className="py-3 text-right text-rose-700">{item.days_expired} days</td><td className="py-3 text-right font-semibold">{quantity.format(item.quantity_remaining)} {item.base_unit}</td><td className="py-3 text-right">{currency.format(item.stock_value)}</td></tr>)}</tbody>
                    </table>
                  </div>
                  {!loading && !data?.expired_batches.length && <EmptyState message="No expired stock is currently on hand." />}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="space-y-5">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Per-product sales report</CardTitle>
                  <CardDescription>All companies, categories, and products are included by default. Choose specific filters to narrow the report.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <ReportMultiSelect
                      label="Companies / brands"
                      allLabel="All companies"
                      options={productFilterOptions.companies.map((item) => ({ value: item, label: item }))}
                      selected={selectedCompanies}
                      onSelectedChange={(values) => { setSelectedCompanies(values); setProductReportPage(1); setProductReport(null); setProductReportError(null); }}
                    />
                    <ReportMultiSelect
                      label="Categories"
                      allLabel="All categories"
                      options={productFilterOptions.categories.map((item) => ({ value: item, label: item }))}
                      selected={selectedCategories}
                      onSelectedChange={(values) => { setSelectedCategories(values); setProductReportPage(1); setProductReport(null); setProductReportError(null); }}
                    />
                    <ReportMultiSelect
                      label="Products"
                      allLabel="All products"
                      options={selectableProducts}
                      selected={selectedProducts.map((item) => String(item.id))}
                      searchValue={productSearch}
                      onSearchValueChange={setProductSearch}
                      loading={productOptionsLoading}
                      searchHint="Type at least 2 characters"
                      onSelectedChange={(values) => {
                        const available = new Map([...selectedProducts, ...productSuggestions].map((item) => [String(item.id), item]));
                        setSelectedProducts(values.flatMap((value) => available.get(value) || []));
                        setProductReportPage(1);
                        setProductReport(null);
                        setProductReportError(null);
                      }}
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
                      <div className="space-y-2">
                        <Label>Time period</Label>
                        <Select value={productPeriod} onValueChange={updateProductPeriod}>
                          <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Today</SelectItem>
                            <SelectItem value="7">Last 7 days</SelectItem>
                            <SelectItem value="30">Last 30 days</SelectItem>
                            <SelectItem value="90">Last 90 days</SelectItem>
                            <SelectItem value="year">This year</SelectItem>
                            <SelectItem value="custom">Custom dates</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="product-report-from">From</Label>
                          <Input id="product-report-from" type="date" value={productStartDate} disabled={productPeriod !== "custom"} onChange={(event) => { setProductStartDate(event.target.value); setProductReportPage(1); setProductReport(null); setProductReportError(null); }} className="bg-white" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="product-report-to">To</Label>
                          <Input id="product-report-to" type="date" value={productEndDate} disabled={productPeriod !== "custom"} onChange={(event) => { setProductEndDate(event.target.value); setProductReportPage(1); setProductReport(null); setProductReportError(null); }} className="bg-white" />
                        </div>
                      </div>
                      <Button onClick={() => loadProductReport(1)} disabled={productDatesInvalid || productReportLoading} className="min-w-36">
                        {productReportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {productReportLoading ? "Loading…" : "Load Report"}
                      </Button>
                    </div>
                    {productDatesInvalid && <p className="mt-3 text-xs text-rose-700">Choose a valid date range.</p>}
                  </div>

                  {productReportError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Unable to load product report</AlertTitle><AlertDescription>{productReportError}</AlertDescription></Alert>}

                  {!productReport && !productReportLoading && !productReportError && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
                      <Play className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                      <p className="font-medium text-slate-700">Your report has not been loaded yet</p>
                      <p className="mt-1 text-sm text-slate-500">Review the filters and time period, then click Load Report.</p>
                    </div>
                  )}

                  {productReport && (
                    <>
                      {productReportTotalPages > 1 && (
                        <p className="text-xs text-slate-500">Summary values cover the {productReport.products.length} products shown on this page.</p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <ReportMetric label="Sales revenue" value={currency.format(productReport.summary.sales_revenue)} />
                        <ReportMetric label="Quantity sold" value={quantity.format(productReport.summary.sold_quantity)} />
                        <ReportMetric label="Purchase cost" value={currency.format(productReport.summary.purchase_cost)} />
                        <ReportMetric label="Gross profit / loss" value={currency.format(productReport.summary.profit_loss)} tone={productReport.summary.profit_loss >= 0 ? "positive" : "negative"} />
                      </div>
                      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="pb-3">Product</th><th className="pb-3">Company / category</th><th className="pb-3 text-right">Purchased</th><th className="pb-3 text-right">Sold</th><th className="pb-3 text-right">Sales</th><th className="pb-3 text-right">COGS</th><th className="pb-3 text-right">Profit / loss</th><th className="pb-3 text-right">Transactions</th></tr></thead><tbody>{productReport.products.map((item) => <tr key={item.product_id} className="border-b border-slate-100 last:border-0"><td className="py-3"><p className="font-medium">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku || "No SKU"}</p></td><td className="py-3"><p>{item.company || "—"}</p><p className="text-xs text-slate-500">{item.category || "Uncategorized"}</p></td><td className="py-3 text-right">{quantity.format(item.purchased_quantity)} {item.base_unit}</td><td className="py-3 text-right">{quantity.format(item.sold_quantity)} {item.base_unit}</td><td className="py-3 text-right">{currency.format(item.sales_revenue)}</td><td className="py-3 text-right">{currency.format(item.cost_of_goods_sold)}</td><td className={`py-3 text-right font-bold ${item.profit_loss >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{currency.format(item.profit_loss)}</td><td className="py-3 text-right">{item.sales_transactions}</td></tr>)}</tbody></table></div>
                      {!productReport.products.length && <EmptyState message="No products match the selected filters." />}
                      {productReport.total_matching_products > 0 && (
                        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-slate-500">
                            Showing {(productReportPage - 1) * PRODUCT_REPORT_PAGE_SIZE + 1}–{Math.min(productReportPage * PRODUCT_REPORT_PAGE_SIZE, productReport.total_matching_products)} of {productReport.total_matching_products} products
                          </p>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => loadProductReport(productReportPage - 1)} disabled={productReportPage <= 1 || productReportLoading}>Previous</Button>
                            <span className="min-w-24 text-center text-sm font-medium">Page {productReportPage} of {productReportTotalPages}</span>
                            <Button variant="outline" size="sm" onClick={() => loadProductReport(productReportPage + 1)} disabled={productReportPage >= productReportTotalPages || productReportLoading}>Next</Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-600" /> Sales over the last {months} months</CardTitle><CardDescription>Revenue and units sold across all products</CardDescription></CardHeader>
                <CardContent className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data?.monthly_sales || []} margin={{ left: 4, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} tickFormatter={(value) => format(new Date(`${value}-01T00:00:00`), "MMM yy")} />
                      <YAxis yAxisId="revenue" tick={{ fontSize: 12 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                      <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value, name) => name === "Revenue" ? currency.format(Number(value || 0)) : quantity.format(Number(value || 0))} labelFormatter={(value) => format(new Date(`${value}-01T00:00:00`), "MMMM yyyy")} />
                      <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
                      <Line yAxisId="units" type="monotone" dataKey="quantity_sold" name="Units sold" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <div className="grid gap-5 xl:grid-cols-2">
                <ProductRanking title={`Most selling ${topN}`} description="Highest quantity sold in the selected period" icon={TrendingUp} rows={data?.most_selling || []} tone="blue" loading={loading} />
                <ProductRanking title={`Least selling ${topN}`} description="Includes products with no sales in the selected period" icon={TrendingDown} rows={data?.least_selling || []} tone="amber" loading={loading} />
              </div>
            </TabsContent>

            <TabsContent value="buying" className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-2">
                <Card className="border-0 shadow-sm">
                  <CardHeader><CardTitle>Vendors bought from most</CardTitle><CardDescription>Total purchase value in the selected period</CardDescription></CardHeader>
                  <CardContent className="h-[310px]">
                    {data?.top_vendors.length ? <ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data.top_vendors} margin={{ left: 10, right: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><YAxis dataKey="vendor_name" type="category" width={110} tick={{ fontSize: 12 }} /><Tooltip formatter={(value) => currency.format(Number(value || 0))} /><Bar dataKey="total_bought" name="Purchases" fill="#2563eb" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <EmptyState message="No purchases found for this period." />}
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardHeader><CardTitle>Highest vendor payables</CardTitle><CardDescription>Current AP ledger balances—not limited by the date filter</CardDescription></CardHeader>
                  <CardContent className="space-y-2">
                    {data?.outstanding_vendors.map((vendor, index) => <div key={vendor.vendor_id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3"><div className="flex min-w-0 items-center gap-3"><Rank value={index + 1} tone="rose" /><div className="min-w-0"><p className="truncate font-medium">{vendor.vendor_name}</p><p className="text-xs text-slate-500">{vendor.phone || "No phone number"}</p></div></div><span className="font-bold text-rose-600">{currency.format(vendor.outstanding_amount)}</span></div>)}
                    {!loading && !data?.outstanding_vendors.length && <EmptyState message="No vendor payments are outstanding." />}
                  </CardContent>
                </Card>
              </div>
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle>Vendor price comparison</CardTitle><CardDescription>Products purchased from multiple vendors, ranked by the largest weighted-average price difference</CardDescription></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="pb-3">Product</th><th className="pb-3">Vendor prices</th><th className="pb-3 text-right">Lowest</th><th className="pb-3 text-right">Highest</th><th className="pb-3 text-right">Difference</th></tr></thead><tbody>{data?.vendor_price_comparisons.map((item) => <tr key={item.product_id} className="border-b border-slate-100 align-top last:border-0"><td className="py-4"><p className="font-medium">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku || "No SKU"}</p></td><td className="py-4"><div className="flex flex-wrap gap-2">{item.vendors.map((vendor) => <Badge key={vendor.vendor_id} variant="secondary" className="font-normal">{vendor.vendor_name}: {currency.format(vendor.average_unit_cost)}</Badge>)}</div></td><td className="py-4 text-right text-emerald-700">{currency.format(item.lowest_price)}</td><td className="py-4 text-right text-rose-700">{currency.format(item.highest_price)}</td><td className="py-4 text-right font-bold">{currency.format(item.price_difference)}</td></tr>)}</tbody></table></div>
                  {!loading && !data?.vendor_price_comparisons.length && <EmptyState message="No products were bought from multiple vendors in this period." />}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="customers" className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-2">
                <CustomerRanking title="Customers who owe most" description="Current accounts-receivable balances" rows={data?.outstanding_customers || []} metric="outstanding" loading={loading} />
                <CustomerRanking title="Most buying customers" description="Highest total sales in the selected period" rows={data?.top_customers || []} metric="bought" loading={loading} />
              </div>
            </TabsContent>

            <TabsContent value="staff" className="space-y-5">
              <StaffSales rows={data?.staff_sales || []} loading={loading} />
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button onClick={fetchAnalytics} disabled={loading} variant="outline"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh analytics</Button>
          </div>
        </div>
      </div>
    </AdminRouteGuard>
  );
}

function ReportMetric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-xl font-bold ${tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-rose-700" : "text-slate-950"}`}>{value}</p></div>;
}

function ReportMultiSelect({
  label,
  options,
  selected,
  onSelectedChange,
  allLabel,
  searchValue,
  onSearchValueChange,
  loading = false,
  searchHint = "Search options",
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onSelectedChange: (values: string[]) => void;
  allLabel: string;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  loading?: boolean;
  searchHint?: string;
}) {
  const toggle = (value: string) => {
    onSelectedChange(selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value]);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="h-auto min-h-10 w-full justify-between bg-white px-3 font-normal">
            <span className="truncate text-slate-900">
              {selected.length ? `${selected.length} selected` : allLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          {onSearchValueChange && (
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={searchValue || ""}
                  onChange={(event) => onSearchValueChange(event.target.value)}
                  placeholder={searchHint}
                  className="pl-8"
                />
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => onSelectedChange([])}
              className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-100"
            >
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected.length === 0 ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>
                {selected.length === 0 && <Check className="h-3 w-3" />}
              </span>
              <span className="text-sm font-medium text-slate-900">{allLabel}</span>
            </button>
            {options.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-100"
                >
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900">{option.label}</span>
                    {option.description && <span className="block truncate text-xs text-slate-500">{option.description}</span>}
                  </span>
                </button>
              );
            })}
            {loading && <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Searching…</div>}
            {!loading && !options.length && <div className="px-3 py-6 text-center text-sm text-slate-500">{onSearchValueChange && (searchValue || "").trim().length < 2 ? searchHint : "No options found"}</div>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StockCard({ title, description, icon: Icon, tone, rows, total, loading }: { title: string; description: string; icon: typeof AlertTriangle; tone: "amber" | "rose"; rows: AnalyticsOverviewReport["low_stock"]; total: number; loading: boolean }) {
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Icon className={`h-5 w-5 ${tone === "amber" ? "text-amber-600" : "text-rose-600"}`} />{title}<Badge variant="secondary" className="ml-auto">{total}</Badge></CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-2">{rows.slice(0, 20).map((item) => <div key={item.product_id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3"><div className="min-w-0"><p className="truncate font-medium">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku || item.category || "No SKU"}</p></div><div className="text-right"><p className={`font-bold ${tone === "amber" ? "text-amber-700" : "text-rose-700"}`}>{quantity.format(item.current_stock)} {item.base_unit}</p><p className="text-xs text-slate-500">Reorder at {item.threshold}</p></div></div>)}{!loading && !rows.length && <EmptyState message={tone === "amber" ? "No products are running low." : "No products are out of stock."} />}</CardContent></Card>;
}

function ProductRanking({ title, description, icon: Icon, rows, tone, loading }: { title: string; description: string; icon: typeof TrendingUp; rows: AnalyticsOverviewReport["most_selling"]; tone: "blue" | "amber"; loading: boolean }) {
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Icon className={tone === "blue" ? "h-5 w-5 text-blue-600" : "h-5 w-5 text-amber-600"} />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-2">{rows.map((item, index) => <div key={item.product_id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3"><div className="flex min-w-0 items-center gap-3"><Rank value={index + 1} tone={tone} /><div className="min-w-0"><p className="truncate font-medium">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku || "No SKU"}</p></div></div><div className="text-right"><p className="font-bold">{quantity.format(item.quantity_sold)} sold</p><p className="text-xs text-slate-500">{currency.format(item.revenue)}</p></div></div>)}{!loading && !rows.length && <EmptyState message="No products found." />}</CardContent></Card>;
}

function CustomerRanking({ title, description, rows, metric, loading }: { title: string; description: string; rows: AnalyticsOverviewReport["top_customers"]; metric: "outstanding" | "bought"; loading: boolean }) {
  const chartRows = rows.map((row) => ({ ...row, value: metric === "outstanding" ? row.outstanding_amount : row.total_bought }));
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><div className="h-[250px]">{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} margin={{ left: 0, right: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="customer_name" tick={{ fontSize: 11 }} interval={0} tickFormatter={(value) => value.length > 11 ? `${value.slice(0, 10)}…` : value} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => currency.format(Number(value || 0))} /><Bar dataKey="value" name={metric === "outstanding" ? "Outstanding" : "Purchases"} radius={[5, 5, 0, 0]}>{chartRows.map((row, index) => <Cell key={row.customer_id} fill={metric === "outstanding" ? ["#e11d48", "#f43f5e", "#fb7185", "#fda4af"][index % 4] : ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"][index % 4]} />)}</Bar></BarChart></ResponsiveContainer> : !loading && <EmptyState message={metric === "outstanding" ? "No customers have an outstanding balance." : "No linked customer sales found in this period."} />}</div><div className="mt-3 space-y-2">{rows.map((customer, index) => <div key={customer.customer_id} className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm"><span className="flex min-w-0 items-center gap-2"><Rank value={index + 1} tone={metric === "outstanding" ? "rose" : "blue"} /><span className="truncate">{customer.customer_name}</span></span><span className="font-semibold">{currency.format(metric === "outstanding" ? customer.outstanding_amount : customer.total_bought)}</span></div>)}</div></CardContent></Card>;
}

function StaffSales({ rows, loading }: { rows: AnalyticsOverviewReport["staff_sales"]; loading: boolean }) {
  const chartData = rows.slice(0, 10).map((row) => ({ ...row, label: row.username }));
  return (
    <div className="space-y-5">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-blue-600" /> Sales by staff</CardTitle>
          <CardDescription>Total revenue generated by each user in the selected period</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value) => currency.format(Number(value || 0))} />
                <Bar dataKey="total_revenue" name="Revenue" fill="#2563eb" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : !loading && <EmptyState message="No staff sales found in this period." />}
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Staff performance</CardTitle>
          <CardDescription>Transactions, items sold, and current cash drawer status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">User</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3 text-right">Transactions</th>
                  <th className="pb-3 text-right">Items sold</th>
                  <th className="pb-3 text-right">Revenue</th>
                  <th className="pb-3 text-right">Avg. sale</th>
                  <th className="pb-3 text-right">Cash drawer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-medium">{row.username}</td>
                    <td className="py-3 capitalize text-slate-500">{row.role}</td>
                    <td className="py-3 text-right">{row.transaction_count}</td>
                    <td className="py-3 text-right">{quantity.format(row.items_sold)}</td>
                    <td className="py-3 text-right font-bold">{currency.format(row.total_revenue)}</td>
                    <td className="py-3 text-right">{currency.format(row.average_transaction)}</td>
                    <td className="py-3 text-right">
                      {row.cash_register_status === "open" ? (
                        <Badge variant="secondary">{currency.format(row.cash_on_hand || 0)}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">Closed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !rows.length && <EmptyState message="No staff sales activity in this period." />}
        </CardContent>
      </Card>
    </div>
  );
}
