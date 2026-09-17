"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsOverviewReport, reportsApi } from "@/lib/api";

const currency = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

const quantity = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });

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

  const summary = useMemo(() => ({
    stockAttention: (data?.low_stock.length || 0) + (data?.out_of_stock.length || 0),
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
              { label: "Stock needs attention", value: summary.stockAttention, note: `${data?.out_of_stock.length || 0} out of stock`, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
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
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-4">
              <TabsTrigger value="inventory" className="gap-2 py-2.5"><Boxes className="h-4 w-4" /> Inventory</TabsTrigger>
              <TabsTrigger value="products" className="gap-2 py-2.5"><ShoppingBag className="h-4 w-4" /> Products</TabsTrigger>
              <TabsTrigger value="buying" className="gap-2 py-2.5"><Truck className="h-4 w-4" /> Buying</TabsTrigger>
              <TabsTrigger value="customers" className="gap-2 py-2.5"><Users className="h-4 w-4" /> Customers</TabsTrigger>
            </TabsList>

            <TabsContent value="inventory" className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-2">
                <StockCard title="Low stock products" description="In stock, but at or below the reorder threshold" icon={AlertTriangle} tone="amber" rows={data?.low_stock || []} loading={loading} />
                <StockCard title="Out of stock" description="Products with no available stock" icon={PackageCheck} tone="rose" rows={data?.out_of_stock || []} loading={loading} />
              </div>
            </TabsContent>

            <TabsContent value="products" className="space-y-5">
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
          </Tabs>

          <div className="flex justify-end">
            <Button onClick={fetchAnalytics} disabled={loading} variant="outline"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh analytics</Button>
          </div>
        </div>
      </div>
    </AdminRouteGuard>
  );
}

function StockCard({ title, description, icon: Icon, tone, rows, loading }: { title: string; description: string; icon: typeof AlertTriangle; tone: "amber" | "rose"; rows: AnalyticsOverviewReport["low_stock"]; loading: boolean }) {
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Icon className={`h-5 w-5 ${tone === "amber" ? "text-amber-600" : "text-rose-600"}`} />{title}<Badge variant="secondary" className="ml-auto">{rows.length}</Badge></CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-2">{rows.slice(0, 20).map((item) => <div key={item.product_id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3"><div className="min-w-0"><p className="truncate font-medium">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku || item.category || "No SKU"}</p></div><div className="text-right"><p className={`font-bold ${tone === "amber" ? "text-amber-700" : "text-rose-700"}`}>{quantity.format(item.current_stock)} {item.base_unit}</p><p className="text-xs text-slate-500">Reorder at {item.threshold}</p></div></div>)}{!loading && !rows.length && <EmptyState message={tone === "amber" ? "No products are running low." : "No products are out of stock."} />}</CardContent></Card>;
}

function ProductRanking({ title, description, icon: Icon, rows, tone, loading }: { title: string; description: string; icon: typeof TrendingUp; rows: AnalyticsOverviewReport["most_selling"]; tone: "blue" | "amber"; loading: boolean }) {
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Icon className={tone === "blue" ? "h-5 w-5 text-blue-600" : "h-5 w-5 text-amber-600"} />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-2">{rows.map((item, index) => <div key={item.product_id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3"><div className="flex min-w-0 items-center gap-3"><Rank value={index + 1} tone={tone} /><div className="min-w-0"><p className="truncate font-medium">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku || "No SKU"}</p></div></div><div className="text-right"><p className="font-bold">{quantity.format(item.quantity_sold)} sold</p><p className="text-xs text-slate-500">{currency.format(item.revenue)}</p></div></div>)}{!loading && !rows.length && <EmptyState message="No products found." />}</CardContent></Card>;
}

function CustomerRanking({ title, description, rows, metric, loading }: { title: string; description: string; rows: AnalyticsOverviewReport["top_customers"]; metric: "outstanding" | "bought"; loading: boolean }) {
  const chartRows = rows.map((row) => ({ ...row, value: metric === "outstanding" ? row.outstanding_amount : row.total_bought }));
  return <Card className="border-0 shadow-sm"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><div className="h-[250px]">{rows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} margin={{ left: 0, right: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="customer_name" tick={{ fontSize: 11 }} interval={0} tickFormatter={(value) => value.length > 11 ? `${value.slice(0, 10)}…` : value} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => currency.format(Number(value || 0))} /><Bar dataKey="value" name={metric === "outstanding" ? "Outstanding" : "Purchases"} radius={[5, 5, 0, 0]}>{chartRows.map((row, index) => <Cell key={row.customer_id} fill={metric === "outstanding" ? ["#e11d48", "#f43f5e", "#fb7185", "#fda4af"][index % 4] : ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"][index % 4]} />)}</Bar></BarChart></ResponsiveContainer> : !loading && <EmptyState message={metric === "outstanding" ? "No customers have an outstanding balance." : "No linked customer sales found in this period."} />}</div><div className="mt-3 space-y-2">{rows.map((customer, index) => <div key={customer.customer_id} className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm"><span className="flex min-w-0 items-center gap-2"><Rank value={index + 1} tone={metric === "outstanding" ? "rose" : "blue"} /><span className="truncate">{customer.customer_name}</span></span><span className="font-semibold">{currency.format(metric === "outstanding" ? customer.outstanding_amount : customer.total_bought)}</span></div>)}</div></CardContent></Card>;
}
