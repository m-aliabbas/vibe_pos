'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import {
  Store,
  BarChart3,
  Package,
  ShoppingCart,
  Users,
  Truck,
  Receipt,
  User,
  LogOut,
  Menu,
  X,
  Home,
  UserCheck,
  RotateCcw,
  Database,
} from 'lucide-react';
import { useState } from 'react';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Don't show navbar on login page
  if (pathname === '/login') return null;

  // Don't show navbar if user is not logged in
  if (!user) return null;

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navItems = [
    { href: user?.role === 'admin' ? '/admin' : '/sales', label: 'Home', icon: Home, show: true },
    { href: '/sales', label: 'Sales', icon: Store, show: true },
    { href: '/inventory', label: 'Inventory', icon: Package, show: true },
    { href: '/customers', label: 'Customers', icon: UserCheck, show: true },
    { href: '/vendors', label: 'Vendors', icon: Truck, show: true },
    { href: '/returns', label: 'Returns', icon: RotateCcw, show: true },
    { href: '/sales/history', label: 'History', icon: Receipt, show: true },
    // { href: '/admin', label: 'Reports', icon: BarChart3, show: user?.role === 'admin' },
    { href: '/users', label: 'Users', icon: Users, show: user?.role === 'admin' },
    { href: '/backup', label: 'Backup', icon: Database, show: user?.role === 'admin' },
  ];

  const visibleNavItems = navItems.filter(item => item.show);

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo & Brand */}
          <div className="flex items-center min-w-[200px]">
            <Link href={user?.role === 'admin' ? '/admin' : '/sales'} className="flex items-center space-x-3 group">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 rounded-lg group-hover:from-blue-700 group-hover:to-indigo-700 transition-all">
                <Store className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  POS System
                </h1>
                <p className="text-xs text-gray-500">Point of Sale</p>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive(item.href) ? "default" : "ghost"}
                    className={`flex items-center gap-2 ${
                      isActive(item.href)
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-2 rounded-full">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium">{user?.username}</p>
                    <Badge variant={user?.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                      {user?.role}
                    </Badge>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.username}</p>
                    <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button
                    variant={isActive(item.href) ? "default" : "ghost"}
                    className={`w-full justify-start gap-2 ${
                      isActive(item.href)
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
