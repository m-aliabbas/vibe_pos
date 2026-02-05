"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { AutoBreadcrumb } from '@/components/AutoBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  BarChart3,
  Package,
  DollarSign,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  Home,
  TrendingUp,
  PieChart,
  FileText,
  Store,
  Truck,
  Tags
} from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  // Check if user is admin
  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
        </Card>
      </div>
    );
  }

  const menuItems = [
    {
      href: '/admin',
      label: 'Dashboard',
      icon: Home,
      description: 'Overview and key metrics'
    },
    // Management Section
    {
      href: '/sales',
      label: 'Point of Sale',
      icon: Store,
      description: 'Create new orders'
    },
    {
      href: '/inventory',
      label: 'Inventory',
      icon: Tags,
      description: 'Manage products & stock'
    },
    {
      href: '/vendors',
      label: 'Vendors',
      icon: Truck,
      description: 'Manage suppliers'
    },
    {
      href: '/users',
      label: 'Staff Management',
      icon: Users,
      description: 'Manage users & roles'
    },
    // Reports Section
    {
      href: '/admin/reports/sales',
      label: 'Sales Reports',
      icon: BarChart3,
      description: 'Revenue and transaction analytics'
    },
    {
      href: '/admin/reports/inventory',
      label: 'Inventory Reports',
      icon: Package,
      description: 'Stock levels and turnover'
    },
    {
      href: '/admin/reports/financial',
      label: 'Financial Reports',
      icon: DollarSign,
      description: 'Profit & loss, margins'
    },
    {
      href: '/admin/reports/purchases',
      label: 'Purchase Reports',
      icon: ShoppingCart,
      description: 'Vendor and cost analysis'
    },
    {
      href: '/admin/reports/users',
      label: 'User Reports',
      icon: FileText,
      description: 'Performance and activity'
    },
    // Settings Section
    {
      href: '/backup',
      label: 'Backup & Restore',
      icon: Settings,
      description: 'Database backup management'
    },
  ];

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <PieChart className="h-8 w-8 text-blue-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user.username}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="flex items-center"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-sm min-h-[calc(100vh-4rem)]">
          <nav className="p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center p-3 rounded-lg transition-colors ${isActive(item.href)
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-gray-500">{item.description}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;