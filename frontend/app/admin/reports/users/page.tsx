"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import ReportFilters from '@/components/ReportFilters';
import DataTable from '@/components/DataTable';
import MetricCard from '@/components/MetricCard';
import ChartContainer from '@/components/ChartContainer';
import { Users, DollarSign, Activity } from 'lucide-react';
import api from '@/lib/api';

interface UserPerformanceItem {
  user_id: number;
  username: string;
  role: string;
  sales_count: number;
  total_revenue: number;
  avg_sale_value: number;
  daily_avg_sales: number;
  items_sold: number;
}

interface UserPerformanceReport {
  users: UserPerformanceItem[];
  period_days: number;
}

interface UserSalesActivity {
  user_id: number;
  username: string;
  role: string;
  sales_count: number;
  total_revenue: number;
}

interface UserRoleCount {
  role: string;
  count: number;
}

interface UserActivityReport {
  user_sales: UserSalesActivity[];
  user_roles: UserRoleCount[];
}

const UserReports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [performanceData, setPerformanceData] = useState<UserPerformanceReport | null>(null);
  const [activityData, setActivityData] = useState<UserActivityReport | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper to safely parse
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
      const [perfResponse, activityResponse] = await Promise.all([
        api.get('/reports/users/performance', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate }
        }),
        api.get('/reports/users/activity', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate }
        })
      ]);

      setPerformanceData(parseResponseData(perfResponse.data));
      setActivityData(parseResponseData(activityResponse.data));
    } catch (error) {
      console.error('Failed to fetch user report data:', error);
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

  const performanceColumns = [
    { key: 'username', label: 'User' },
    { key: 'role', label: 'Role' },
    { key: 'sales_count', label: 'Transactions' },
    { key: 'items_sold', label: 'Items Sold' },
    { 
      key: 'total_revenue', 
      label: 'Revenue',
      render: (value: number) => `₹${value?.toFixed(2)}`
    },
    { 
      key: 'avg_sale_value', 
      label: 'Avg Sale',
      render: (value: number) => `₹${value?.toFixed(2)}`
    },
    { 
      key: 'daily_avg_sales', 
      label: 'Daily Txns',
      render: (value: number) => value?.toFixed(1)
    }
  ];

  // Calculate high-level metrics
  const totalUsers = activityData?.user_roles.reduce((sum, r) => sum + r.count, 0) || 0;
  const activeUsers = performanceData?.users.filter(u => u.sales_count > 0).length || 0;
  const totalRevenueGenerated = performanceData?.users.reduce((sum, u) => sum + u.total_revenue, 0) || 0;

  // Prepare chart data
  const topRevenueUsers = performanceData?.users
    .filter(u => u.total_revenue > 0)
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10) || [];
  
  const revenueByUserData = {
    labels: topRevenueUsers.map(u => u.username),
    datasets: [{
      label: 'Revenue',
      data: topRevenueUsers.map(u => u.total_revenue),
    }]
  };

  const topTransactionUsers = performanceData?.users
    .filter(u => u.sales_count > 0)
    .sort((a, b) => b.sales_count - a.sales_count)
    .slice(0, 10) || [];
  
  const transactionsByUserData = {
    labels: topTransactionUsers.map(u => u.username),
    datasets: [{
      label: 'Transactions',
      data: topTransactionUsers.map(u => u.sales_count),
    }]
  };

  return (
    <AdminRouteGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">User Reports</h1>
              <p className="text-gray-600 mt-1">Staff performance metrics and activity tracking</p>
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
              title="Total Staff"
              value={totalUsers}
              icon={Users}
            />
            <MetricCard
              title="Active Sales Staff"
              value={activeUsers}
              icon={Activity}
            />
            <MetricCard
              title="Staff Revenue"
              value={totalRevenueGenerated}
              icon={DollarSign}
              prefix="$"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <ChartContainer
                title="Top Performing Staff (Revenue)"
                data={revenueByUserData}
                type="bar"
                height={300}
              />
               <ChartContainer
                title="Staff Efficiency (Transactions)"
                data={transactionsByUserData}
                type="bar"
                height={300}
              />
          </div>

          <DataTable
            title="Detailed Performance Metrics"
            data={performanceData?.users || []}
            columns={performanceColumns}
            loading={loading}
            onExport={() => handleExport('/reports/users/performance', 'user_performance.csv')}
          />
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
};

export default UserReports;