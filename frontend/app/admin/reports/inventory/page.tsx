"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import DataTable from '@/components/DataTable';
import MetricCard from '@/components/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, AlertTriangle, Layers, ArrowRightLeft } from 'lucide-react';
import api from '@/lib/api';

interface StockLevel {
  product_id: number;
  product_name: string;
  sku: string;
  current_stock: number;
  base_unit: string;
  category: string;
  selling_price: number;
}

interface StockLevelReport {
  products: StockLevel[];
  total_products: number;
  low_stock_count: number;
}

interface LowStockAlert {
  product_id: number;
  product_name: string;
  sku: string;
  current_stock: number;
  threshold: number;
  base_unit: string;
  category: string;
}

const InventoryReports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'stock' | 'alerts'>('stock');
  const [stockData, setStockData] = useState<StockLevelReport | null>(null);
  const [alertsData, setAlertsData] = useState<LowStockAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStockData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/reports/inventory/stock-levels');
      setStockData(response.data);
    } catch (error) {
      console.error('Failed to fetch stock levels:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlertsData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/reports/inventory/low-stock-alerts');
      setAlertsData(response.data);
    } catch (error) {
      console.error('Failed to fetch low stock alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'stock') {
      fetchStockData();
    } else {
      fetchAlertsData();
    }
  }, [activeTab]);

  const handleExport = async (endpoint: string, filename: string) => {
    try {
      const response = await api.get(endpoint, {
        params: { export: true },
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

  const stockColumns = [
    { key: 'product_name', label: 'Product Name' },
    { key: 'sku', label: 'SKU' },
    { key: 'category', label: 'Category' },
    { key: 'current_stock', label: 'Current Stock' },
    { key: 'base_unit', label: 'Unit' },
    { 
      key: 'selling_price', 
      label: 'Price',
      render: (value: number) => `$${value?.toFixed(2)}`
    }
  ];

  const alertColumns = [
    { key: 'product_name', label: 'Product Name' },
    { key: 'sku', label: 'SKU' },
    { key: 'current_stock', label: 'Current Stock', className: 'text-red-600 font-medium' },
    { key: 'threshold', label: 'Threshold' },
    { 
      key: 'status', 
      label: 'Status', 
      render: (_: any, row: LowStockAlert) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          Low Stock
        </span>
      )
    }
  ];

  return (
    <AdminRouteGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Inventory Reports</h1>
              <p className="text-gray-600 mt-1">Monitor stock levels and inventory health</p>
            </div>
            <div className="flex space-x-2">
              <Button 
                variant={activeTab === 'stock' ? 'default' : 'outline'}
                onClick={() => setActiveTab('stock')}
              >
                <Package className="h-4 w-4 mr-2" />
                Stock Levels
              </Button>
              <Button 
                variant={activeTab === 'alerts' ? 'default' : 'outline'}
                onClick={() => setActiveTab('alerts')}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Low Stock Alerts
              </Button>
            </div>
          </div>

          {/* Metrics */}
          {activeTab === 'stock' && stockData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricCard
                title="Total Products"
                value={stockData.total_products}
                icon={Package}
              />
              <MetricCard
                title="Low Stock Items"
                value={stockData.low_stock_count}
                icon={AlertTriangle}
                className="border-red-200"
              />
              {/* Added a placeholder metric as we don't have total value yet */}
              <MetricCard
                title="Categories"
                value={new Set(stockData.products.map(p => p.category)).size}
                icon={Layers}
              />
            </div>
          )}

          {/* Main Content */}
          {activeTab === 'stock' ? (
            <DataTable
              title="Current Stock Levels"
              data={stockData?.products || []}
              columns={stockColumns}
              loading={loading}
              onExport={() => handleExport('/reports/inventory/stock-levels', 'stock_levels.csv')}
            />
          ) : (
            <DataTable
              title="Low Stock Alerts"
              data={alertsData}
              columns={alertColumns}
              loading={loading}
              onExport={() => handleExport('/reports/inventory/low-stock-alerts', 'low_stock_alerts.csv')}
              emptyMessage="No low stock alerts found. Good job!"
            />
          )}
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
};

export default InventoryReports;