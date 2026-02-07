'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDateRangePicker } from "@/components/ui/date-range-picker";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';
import {
    DollarSign,
    ShoppingCart,
    TrendingUp,
    AlertTriangle,
    Package,
    ArrowUpRight,
    ArrowDownRight,
    Download
} from "lucide-react";
import { addDays, format, subDays } from "date-fns";

export default function ReportsPage() {
    const [dateRange, setDateRange] = useState({
        from: subDays(new Date(), 30),
        to: new Date(),
    });

    const [summary, setSummary] = useState<any>(null);
    const [salesTrend, setSalesTrend] = useState<any>(null);
    const [topProducts, setTopProducts] = useState<any>(null);
    const [lowStock, setLowStock] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReports();
    }, [dateRange]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const start = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
            const end = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
            const queryParams = `?start_date=${start}&end_date=${end}`;

            const [summaryRes, trendRes, topRes, lowStockRes] = await Promise.all([
                api.get(`/reports/sales/summary${queryParams}`),
                api.get(`/reports/sales/trends${queryParams}&period=daily`),
                api.get(`/reports/sales/top-products${queryParams}&limit=5`),
                api.get(`/reports/inventory/low-stock-alerts`)
            ]);

            setSummary(summaryRes.data);
            setSalesTrend(trendRes.data);
            setTopProducts(topRes.data);
            setLowStock(lowStockRes.data);
        } catch (error) {
            console.error("Failed to fetch reports:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val: number) => `rs ${val.toFixed(2)}`;

    if (loading && !summary) {
        return <div className="p-8 flex justify-center">Loading reports...</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
                    <p className="text-gray-500">Overview of sales performance and inventory health</p>
                </div>
                <div className="flex items-center gap-2">
                    <CalendarDateRangePicker date={dateRange} setDate={setDateRange} />
                    <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" /> Export
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary?.total_revenue || 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {summary?.transaction_count || 0} transactions
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary?.average_transaction || 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center">
                            Per transaction
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{lowStock.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Products below threshold
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Top Product</CardTitle>
                        <Package className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate">
                            {topProducts?.by_revenue?.[0]?.product_name || "N/A"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Highest revenue generator
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sales Trend Chart */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Sales Trend</CardTitle>
                        <CardDescription>Daily revenue over the selected period</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={salesTrend?.data || []}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="period"
                                    tickFormatter={(val) => format(new Date(val), 'MMM dd')}
                                    fontSize={12}
                                />
                                <YAxis
                                    tickFormatter={(val) => `rs ${val}`}
                                    fontSize={12}
                                />
                                <Tooltip
                                    formatter={(value: number | undefined) => value ? [`rs ${value.toFixed(2)}`, 'Revenue'] : ['rs 0.00', 'Revenue']}
                                    labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                                />
                                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Top Products List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Top Products</CardTitle>
                        <CardDescription>By revenue</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {topProducts?.by_revenue?.map((product: any, index: number) => (
                                <div key={product.sku} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 font-bold text-sm text-slate-600">
                                            {index + 1}
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium leading-none">{product.product_name}</p>
                                            <p className="text-xs text-muted-foreground">{product.sku}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold">{formatCurrency(product.total_revenue)}</p>
                                        <p className="text-xs text-muted-foreground">{product.total_quantity} sold</p>
                                    </div>
                                </div>
                            ))}
                            {!topProducts?.by_revenue?.length && (
                                <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Low Stock Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        Low Stock Alert
                    </CardTitle>
                    <CardDescription>
                        These items are running low and should be restocked soon.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left font-medium py-3 text-slate-500">Product Name</th>
                                    <th className="text-left font-medium py-3 text-slate-500">SKU</th>
                                    <th className="text-right font-medium py-3 text-slate-500">Stock Level</th>
                                    <th className="text-right font-medium py-3 text-slate-500">Threshold</th>
                                    <th className="text-right font-medium py-3 text-slate-500">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStock.map((item) => (
                                    <tr key={item.product_id} className="border-b last:border-0 hover:bg-slate-50">
                                        <td className="py-3 font-medium">{item.product_name}</td>
                                        <td className="py-3 text-slate-500">{item.sku}</td>
                                        <td className="py-3 text-right font-bold text-red-600">{item.current_stock > 0 ? item.current_stock : '0 - Out of Stock'}</td>
                                        <td className="py-3 text-right text-slate-500">{item.threshold}</td>
                                        <td className="py-3 text-right">
                                            <Badge variant="destructive">Low Stock</Badge>
                                        </td>
                                    </tr>
                                ))}
                                {lowStock.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                                            No low stock alerts. Good job! 🎉
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
