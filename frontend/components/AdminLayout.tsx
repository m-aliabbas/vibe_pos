"use client";

import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { Card } from '@/components/ui/card';

interface AdminLayoutProps {
  children: React.ReactNode;
}

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

  return <>{children}</>;
};

export default AdminLayout;