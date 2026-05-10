"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import MetricCard from '@/components/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import api from '@/lib/api';

interface DashboardStats {
  totalRevenue: number;
  totalTransactions: number;
  totalProducts: number;
  totalUsers: number;
  avgTransactionValue: number;
  lowStockAlerts: number;
}

const AdminDashboard: React.FC = () => {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);

      // Fetch sales summary for last 30 days
      const salesResponse = await api.get('/reports/sales/summary', {
        params: {
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0]
        }
      });

      // Fetch low stock alerts
      const stockResponse = await api.get('/reports/inventory/low-stock-alerts');

      // Fetch user count (simplified - would need a dedicated endpoint)
      const usersResponse = await api.get('/users/');

      setStats({
        totalRevenue: salesResponse.data.total_revenue || 0,
        totalTransactions: salesResponse.data.transaction_count || 0,
        totalProducts: 0, // Would need a products count endpoint
        totalUsers: usersResponse.data?.length || 0,
        avgTransactionValue: salesResponse.data.average_transaction || 0,
        lowStockAlerts: stockResponse.data?.length || 0
      });
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  return (
    <AdminRouteGuard>
      <AdminLayout>
        <div className="h-full overflow-y-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-1">Welcome to your admin dashboard</p>
            </div>
            <Button onClick={fetchDashboardStats} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Total Revenue"
              value={stats?.totalRevenue || 0}
              subtitle="Last 30 days"
              icon={DollarSign}
              trend={{ value: 12.5, label: "vs last month", isPositive: true }}
              className="border-l-4 border-l-blue-500"
              onClick={() => router.push('/admin/reports/sales')}
              prefix="$"
            />
            <MetricCard
              title="Transactions"
              value={stats?.totalTransactions || 0}
              subtitle="Last 30 days"
              icon={ShoppingCart}
              trend={{ value: 8.2, label: "vs last month", isPositive: true }}
              className="border-l-4 border-l-green-500"
              onClick={() => router.push('/admin/reports/sales')}
            />
            <MetricCard
              title="Low Stock Alerts"
              value={stats?.lowStockAlerts || 0}
              subtitle="Items below threshold"
              icon={Package}
              className="border-l-4 border-l-orange-500"
              onClick={() => router.push('/admin/reports/inventory')}
            />
            <MetricCard
              title="Total Staff"
              value={stats?.totalUsers || 0}
              subtitle="Active users"
              icon={Users}
              className="border-l-4 border-l-purple-500"
              onClick={() => router.push('/admin/reports/users')}
            />
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                  <BarChart3 className="h-6 w-6 mb-2" />
                  <span>View Sales Report</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                  <Package className="h-6 w-6 mb-2" />
                  <span>Check Inventory</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                  <Users className="h-6 w-6 mb-2" />
                  <span>Manage Users</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <p>Recent activity will be displayed here</p>
                <p className="text-sm mt-2">Integration with activity logs coming soon</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
};

export default AdminDashboard;