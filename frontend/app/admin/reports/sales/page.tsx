"use client";

import React, { useCallback, useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import ReportFilters from '@/components/ReportFilters';
import DataTable from '@/components/DataTable';
import MetricCard from '@/components/MetricCard';
import ChartContainer from '@/components/ChartContainer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Search
} from 'lucide-react';
import api, { ProductSalesHistoryReport, reportsApi } from '@/lib/api';

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
  const [productHistory, setProductHistory] = useState<ProductSalesHistoryReport | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [debouncedProductSearch, setDebouncedProductSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);

      const [summaryResponse, topProductsResponse, productHistoryResponse] = await Promise.all([
        api.get('/reports/sales/summary', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate, period }
        }),
        api.get('/reports/sales/top-products', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate, limit: 10 }
        }),
        reportsApi.getProductSalesHistory({
          start_date: dateRange.startDate,
          end_date: dateRange.endDate,
          search: debouncedProductSearch || undefined
        })
      ]);

      setSummaryData(summaryResponse.data);
      setTopProductsData(topProductsResponse.data);
      setProductHistory(productHistoryResponse);
    } catch (error) {
      console.error('Failed to fetch sales reports:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, period, debouncedProductSearch]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedProductSearch(productSearch.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [productSearch]);

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

  const handleProductHistoryExport = async () => {
    try {
      const blob = await reportsApi.exportProductSalesHistory({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
        search: debouncedProductSearch || undefined
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `product_sales_history_${dateRange.startDate}_${dateRange.endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Product history export failed:', error);
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
      render: (value: number, row: SalesSummaryData['period_data'][number]) =>
        row.transactions > 0 ? `rs ${(value / row.transactions).toFixed(2)}` : 'rs 0.00'
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

  const productHistoryColumns = [
    { key: 'product_name', label: 'Product' },
    { key: 'sku', label: 'SKU / Barcode' },
    {
      key: 'purchased_quantity',
      label: 'Qty Purchased',
      render: (value: number, row: ProductSalesHistoryReport['products'][number]) =>
        `${value.toLocaleString()} ${row.base_unit}`
    },
    {
      key: 'sold_quantity',
      label: 'Qty Sold',
      render: (value: number, row: ProductSalesHistoryReport['products'][number]) =>
        `${value.toLocaleString()} ${row.base_unit}`
    },
    {
      key: 'purchase_cost',
      label: 'Purchase Cost',
      render: (value: number) => `Rs ${value.toFixed(2)}`
    },
    {
      key: 'sales_revenue',
      label: 'Sales Revenue',
      render: (value: number) => `Rs ${value.toFixed(2)}`
    },
    {
      key: 'profit_loss',
      label: 'Profit / Loss',
      render: (value: number) => (
        <span className={value >= 0 ? 'font-medium text-green-700' : 'font-medium text-red-700'}>
          {value < 0 ? '-' : ''}Rs {Math.abs(value).toFixed(2)}
        </span>
      )
    }
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
            additionalFilters={(
              <div>
                <Label htmlFor="product-report-search">Product search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="product-report-search"
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Search product name, SKU, barcode, or category..."
                    className="pl-9"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Partial names are supported. For example, “Nestle” lists every matching Nestle product.
                </p>
              </div>
            )}
          />

          {/* Product purchase, sales, and profit history */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title={debouncedProductSearch ? 'Matching Products' : 'All Products'}
              value={productHistory?.summary.matched_products || 0}
              icon={Package}
            />
            <MetricCard
              title="Quantity Purchased"
              value={productHistory?.summary.purchased_quantity || 0}
              subtitle="Net of approved returns; base units"
              icon={ShoppingCart}
            />
            <MetricCard
              title="Quantity Sold"
              value={productHistory?.summary.sold_quantity || 0}
              subtitle="Net of approved returns; base units"
              icon={TrendingUp}
            />
            <MetricCard
              title={debouncedProductSearch ? 'Filtered Profit / Loss' : 'Total Profit / Loss'}
              value={productHistory?.summary.profit_loss || 0}
              prefix="Rs "
              subtitle="Sales revenue minus cost of goods sold"
              icon={DollarSign}
              className={(productHistory?.summary.profit_loss || 0) >= 0
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'}
            />
          </div>

          <DataTable
            title={debouncedProductSearch
              ? `Product Sales History — “${debouncedProductSearch}”`
              : 'Product Sales History'}
            data={productHistory?.products || []}
            columns={productHistoryColumns}
            loading={loading}
            onExport={handleProductHistoryExport}
            emptyMessage="No products match this search"
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
