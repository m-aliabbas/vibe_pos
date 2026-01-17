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
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  BarChart3,
  Download
} from 'lucide-react';
import api from '@/lib/api';

interface SalesSummaryData {
  total_revenue: number;
  transaction_count: number;
  average_transaction: number;
  period_data: Array<{
    period: string;
    transactions: number;
    revenue: number;
  }>;
}

interface TopProductsData {
  by_revenue: Array<{
    product_name: string;
    sku: string;
    total_revenue: number;
    total_quantity: number;
  }>;
  by_quantity: Array<{
    product_name: string;
    sku: string;
    total_revenue: number;
    total_quantity: number;
  }>;
}

const SalesReports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [period, setPeriod] = useState('daily');
  const [summaryData, setSummaryData] = useState<SalesSummaryData | null>(null);
  const [topProductsData, setTopProductsData] = useState<TopProductsData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    try {
      setLoading(true);

      const [summaryResponse, topProductsResponse] = await Promise.all([
        api.get('/reports/sales/summary', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate, period }
        }),
        api.get('/reports/sales/top-products', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate, limit: 10 }
        })
      ]);

      setSummaryData(summaryResponse.data);
      setTopProductsData(topProductsResponse.data);
    } catch (error) {
      console.error('Failed to fetch sales reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [dateRange, period]);

  const handleExport = async (endpoint: string, filename: string) => {
    try {
      const response = await api.get(endpoint, {
        params: {
          start_date: dateRange.startDate,
          end_date: dateRange.endDate,
          period,
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

  const summaryColumns = [
    { key: 'period', label: 'Period' },
    { key: 'transactions', label: 'Transactions' },
    {
      key: 'revenue',
      label: 'Revenue',
      render: (value: number) => `$${value?.toFixed(2) || '0.00'}`
    },
    {
      key: 'revenue',
      label: 'Avg Transaction',
      render: (value: number, row: any) =>
        row.transactions > 0 ? `$${(value / row.transactions).toFixed(2)}` : '$0.00'
    }
  ];

  const topProductsColumns = [
    { key: 'product_name', label: 'Product Name' },
    { key: 'sku', label: 'SKU' },
    {
      key: 'total_revenue',
      label: 'Revenue',
      render: (value: number) => `$${value?.toFixed(2) || '0.00'}`
    },
    { key: 'total_quantity', label: 'Quantity Sold' }
  ];

  const chartData = summaryData ? {
    labels: summaryData.period_data.map(item => item.period),
    datasets: [{
      label: 'Revenue',
      data: summaryData.period_data.map(item => item.revenue),
      backgroundColor: 'rgba(59, 130, 246, 0.5)',
      borderColor: 'rgba(59, 130, 246, 1)'
    }]
  } : { labels: [], datasets: [] };

  return (
    <AdminRouteGuard>
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Sales Reports</h1>
              <p className="text-gray-600 mt-1">Analyze sales performance and trends</p>
            </div>
          </div>

          {/* Filters */}
          <ReportFilters
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            period={period}
            onPeriodChange={setPeriod}
            onRefresh={fetchReports}
            loading={loading}
          />

          {/* Key Metrics */}
          {summaryData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricCard
                title="Total Revenue"
                value={summaryData.total_revenue}
                subtitle={`${dateRange.startDate} to ${dateRange.endDate}`}
                icon={DollarSign}
              />
              <MetricCard
                title="Total Transactions"
                value={summaryData.transaction_count}
                subtitle={`${dateRange.startDate} to ${dateRange.endDate}`}
                icon={ShoppingCart}
              />
              <MetricCard
                title="Average Transaction"
                value={summaryData.average_transaction}
                subtitle="Per transaction"
                icon={TrendingUp}
              />
            </div>
          )}

          {/* Revenue Trend Chart */}
          <ChartContainer
            title="Revenue Trend"
            type="line"
            data={chartData}
            loading={loading}
            emptyMessage="No sales data available for the selected period"
          />

          {/* Summary Table */}
          <DataTable
            title="Sales Summary by Period"
            data={summaryData?.period_data || []}
            columns={summaryColumns}
            loading={loading}
            onExport={() => handleExport('/reports/sales/summary', `sales_summary_${dateRange.startDate}_${dateRange.endDate}.csv`)}
          />

          {/* Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DataTable
              title="Top Products by Revenue"
              data={topProductsData?.by_revenue || []}
              columns={topProductsColumns}
              loading={loading}
              onExport={() => handleExport('/reports/sales/top-products', `top_products_revenue_${dateRange.startDate}_${dateRange.endDate}.csv`)}
            />

            <DataTable
              title="Top Products by Quantity"
              data={topProductsData?.by_quantity || []}
              columns={topProductsColumns}
              loading={loading}
              onExport={() => handleExport('/reports/sales/top-products', `top_products_quantity_${dateRange.startDate}_${dateRange.endDate}.csv`)}
            />
          </div>
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
};

export default SalesReports;