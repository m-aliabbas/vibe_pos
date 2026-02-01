"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import ReportFilters from '@/components/ReportFilters';
import DataTable from '@/components/DataTable';
import MetricCard from '@/components/MetricCard';
import { Users, Package, ShoppingCart } from 'lucide-react';
import api from '@/lib/api';

interface VendorSummaryItem {
  vendor_id: number;
  vendor_name: string;
  contact_person: string;
  purchase_count: number;
  total_amount: number;
  avg_purchase_amount: number;
}

interface ProductCostItem {
  product_id: number;
  product_name: string;
  sku: string;
  avg_purchase_price: number;
  min_purchase_price: number;
  max_purchase_price: number;
  total_purchased_quantity: number;
}

interface VendorReportData {
  vendors: VendorSummaryItem[];
}

interface ProductCostData {
  products: ProductCostItem[];
}

const PurchaseReports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [vendorData, setVendorData] = useState<VendorReportData | null>(null);
  const [productCostData, setProductCostData] = useState<ProductCostData | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper function to safely parse response data that might be JSON string
  const parseResponseData = (data: any) => {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        console.error('Failed to parse response string:', e);
        return data;
      }
    }
    return data;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vendorResponse, costResponse] = await Promise.all([
        api.get('/reports/purchases/vendor-summary', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate }
        }),
        api.get('/reports/purchases/product-costs', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate }
        })
      ]);

      console.log('Purchase Report Data:', {
        vendors: vendorResponse.data,
        costs: costResponse.data
      });

      setVendorData(parseResponseData(vendorResponse.data));
      setProductCostData(parseResponseData(costResponse.data));
    } catch (error) {
      console.error('Failed to fetch purchase data:', error);
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

  const vendorColumns = [
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'contact_person', label: 'Contact' },
    { key: 'purchase_count', label: 'Orders' },
    { 
      key: 'total_amount', 
      label: 'Total Spent',
      render: (value: number) => `₹${value?.toFixed(2)}`
    },
    { 
      key: 'avg_purchase_amount', 
      label: 'Avg Order',
      render: (value: number) => `₹${value?.toFixed(2)}`
    }
  ];

  const productCostColumns = [
    { key: 'product_name', label: 'Product' },
    { key: 'sku', label: 'SKU' },
    { key: 'total_purchased_quantity', label: 'Qty Purchased' },
    { 
      key: 'avg_purchase_price', 
      label: 'Avg Cost',
      render: (value: number) => `₹${value?.toFixed(2)}`
    },
    { 
      key: 'min_purchase_price', 
      label: 'Min Cost',
      render: (value: number) => `₹${value?.toFixed(2)}`
    },
    { 
      key: 'max_purchase_price', 
      label: 'Max Cost',
      render: (value: number) => `₹${value?.toFixed(2)}`
    }
  ];

  // Calculate totals for summary cards
  const totalSpent = vendorData?.vendors?.reduce((sum, v) => sum + v.total_amount, 0) || 0;
  const totalOrders = vendorData?.vendors?.reduce((sum, v) => sum + v.purchase_count, 0) || 0;
  const activeVendors = vendorData?.vendors?.filter(v => v.purchase_count > 0).length || 0;

  return (
    <AdminRouteGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Purchase Reports</h1>
              <p className="text-gray-600 mt-1">Vendor analysis and purchase cost tracking</p>
            </div>
          </div>

          <ReportFilters
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            onRefresh={fetchData}
            loading={loading}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              title="Total Purchases"
              value={totalSpent}
              icon={ShoppingCart}
              prefix="$"
            />
            <MetricCard
              title="Total Orders"
              value={totalOrders}
              icon={Package}
            />
            <MetricCard
              title="Active Vendors"
              value={activeVendors}
              icon={Users}
            />
          </div>

          <DataTable
            title="Vendor Summary"
            data={vendorData?.vendors || []}
            columns={vendorColumns}
            loading={loading}
            onExport={() => handleExport('/reports/purchases/vendor-summary', 'vendor_summary.csv')}
          />

          <DataTable
            title="Product Cost Analysis"
            data={productCostData?.products || []}
            columns={productCostColumns}
            loading={loading}
            onExport={() => handleExport('/reports/purchases/product-costs', 'product_costs.csv')}
          />
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
};

export default PurchaseReports;