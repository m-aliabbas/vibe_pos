"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import ReportFilters from '@/components/ReportFilters';
import DataTable from '@/components/DataTable';
import MetricCard from '@/components/MetricCard';
import ChartContainer from '@/components/ChartContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import api from '@/lib/api';

interface ProfitLossItem {
  category: string;
  amount: number;
  description: string;
}

interface ProfitLossData {
  revenue: number;
  cost_of_goods_sold: number;
  gross_profit: number;
  expenses: ProfitLossItem[];
  net_profit: number;
  period_start: string;
  period_end: string;
}

interface RevenueBreakdownItem {
  category: string;
  revenue: number;
  quantity: number;
}

interface PaymentBreakdownItem {
  payment_method: string;
  revenue: number;
  transactions: number;
}

interface RevenueBreakdownData {
  by_category: RevenueBreakdownItem[];
  by_payment_method: PaymentBreakdownItem[];
}

const FinancialReports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [profitLoss, setProfitLoss] = useState<ProfitLossData | null>(null);
  const [breakdown, setBreakdown] = useState<RevenueBreakdownData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [plResponse, bdResponse] = await Promise.all([
        api.get('/reports/financial/profit-loss', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate }
        }),
        api.get('/reports/financial/revenue-breakdown', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate }
        })
      ]);

      setProfitLoss(plResponse.data);
      setBreakdown(bdResponse.data);
    } catch (error) {
      console.error('Failed to fetch financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const handleExport = async (endpoint: string, filename: string) => {
    try {
      const response = await api.get(endpoint, {
        params: { 
          start_date: dateRange.startDate, 
          end_date: dateRange.endDate,
          export: true 
        },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const categoryColumns = [
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Quantity Sold' },
    { 
      key: 'revenue', 
      label: 'Revenue',
      render: (value: number) => `$${value?.toFixed(2)}`
    }
  ];

  const paymentColumns = [
    { key: 'payment_method', label: 'Payment Method' },
    { key: 'transactions', label: 'Transactions' },
    { 
      key: 'revenue', 
      label: 'Revenue',
      render: (value: number) => `$${value?.toFixed(2)}`
    }
  ];

  // Chart data setup
  const categoryChartData = breakdown ? {
    labels: breakdown.by_category.map(item => item.category),
    datasets: [{
      label: 'Revenue',
      data: breakdown.by_category.map(item => item.revenue),
    }]
  } : { labels: [], datasets: [] };

  const paymentChartData = breakdown ? {
    labels: breakdown.by_payment_method.map(item => item.payment_method),
    datasets: [{
      label: 'Revenue',
      data: breakdown.by_payment_method.map(item => item.revenue),
    }]
  } : { labels: [], datasets: [] };

  return (
    <AdminRouteGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Financial Reports</h1>
              <p className="text-gray-600 mt-1">Profit & loss, margins, and cash flow analysis</p>
            </div>
          </div>

          <ReportFilters
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            onRefresh={fetchData}
            loading={loading}
          />

          {profitLoss && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <MetricCard
                title="Total Revenue"
                value={profitLoss.revenue}
                icon={DollarSign}
                className="border-blue-100"
              />
              <MetricCard
                title="COGS"
                value={profitLoss.cost_of_goods_sold}
                icon={TrendingDown}
                className="border-orange-100"
              />
              <MetricCard
                title="Gross Profit"
                value={profitLoss.gross_profit}
                icon={TrendingUp}
                className="border-green-100"
              />
              <MetricCard
                title="Net Profit"
                value={profitLoss.net_profit}
                icon={DollarSign}
                className={profitLoss.net_profit >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}
              />
            </div>
          )}

          <Tabs defaultValue="breakdown" className="w-full">
            <TabsList>
              <TabsTrigger value="breakdown">Revenue Breakdown</TabsTrigger>
              <TabsTrigger value="pl">P&L Statement</TabsTrigger>
            </TabsList>
            
            <TabsContent value="breakdown" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <ChartContainer
                    title="Revenue by Category"
                    type="bar" // Using bar instead of pie for now as ChartContainer implementation is generic
                    data={categoryChartData}
                    loading={loading}
                  />
                  <div className="mt-6">
                    <DataTable
                      title="Category Performance"
                      data={breakdown?.by_category || []}
                      columns={categoryColumns}
                      loading={loading}
                    />
                  </div>
                </div>
                
                <div>
                  <ChartContainer
                    title="Revenue by Payment Method"
                    type="bar" // Using bar instead of doughnut
                    data={paymentChartData}
                    loading={loading}
                  />
                  <div className="mt-6">
                    <DataTable
                      title="Payment Methods"
                      data={breakdown?.by_payment_method || []}
                      columns={paymentColumns}
                      loading={loading}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="pl">
              <Card>
                <CardHeader>
                  <CardTitle>Profit & Loss Statement</CardTitle>
                </CardHeader>
                <CardContent>
                  {profitLoss ? (
                    <div className="space-y-4 max-w-2xl mx-auto">
                      <div className="flex justify-between py-2 border-b">
                        <span className="font-medium">Total Revenue</span>
                        <span>${profitLoss.revenue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b text-red-600">
                        <span>Cost of Goods Sold</span>
                        <span>-${profitLoss.cost_of_goods_sold.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b font-bold bg-gray-50 px-2">
                        <span>Gross Profit</span>
                        <span className={profitLoss.gross_profit >= 0 ? "text-green-600" : "text-red-600"}>
                          ${profitLoss.gross_profit.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b text-red-600">
                        <span>Operating Expenses</span>
                        <span>-${(profitLoss.expenses?.reduce((sum, item) => sum + item.amount, 0) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-4 border-b-2 font-bold text-lg bg-gray-100 px-2">
                        <span>Net Profit</span>
                        <span className={profitLoss.net_profit >= 0 ? "text-green-600" : "text-red-600"}>
                          ${profitLoss.net_profit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">No data available</div>
                  )}
                  
                  <div className="mt-6 flex justify-end">
                    <Button onClick={() => handleExport('/reports/financial/profit-loss', 'profit_loss.csv')}>
                      Export CSV
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
};

export default FinancialReports;