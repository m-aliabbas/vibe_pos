"use client";

import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { Card } from '@/components/ui/card';

interface AdminLayoutProps {
  children: React.ReactNode;
}

/**
 * Owner-only page wrapper: access check + the standard page frame.
 * Navigation lives in the top bar, the user menu and Ctrl+K (one system everywhere).
 */
const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { user } = useAuthStore();

  if (!user || user.role !== 'admin') {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
        </Card>
      </div>
    );
  }

  return <div className="h-full overflow-y-auto p-6">{children}</div>;
};

export default AdminLayout;
