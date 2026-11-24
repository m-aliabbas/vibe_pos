'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CashDrawerWidget } from '@/components/CashDrawerWidget';
import {
  Store,
  User,
  LogOut,
  Menu,
  X,
  Database,
  Lock,
  Settings,
  Download,
  LayoutGrid,
  Search,
  BarChart3,
  ClipboardCheck,
} from 'lucide-react';
import { getNavItems, navHotkey } from '@/lib/nav';

/** Opens the global command palette (handled in KeyboardLayer). */
function openCommandPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }));
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [cashDrawerRequestId, setCashDrawerRequestId] = useState(0);
  const [cashDrawerEnabled, setCashDrawerEnabled] = useState(false);

  // Don't show navbar on login page
  if (pathname === '/login') return null;

  // Don't show navbar if user is not logged in
  if (!user) return null;

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    if (path === '/sales') return pathname === '/sales' || pathname.startsWith('/sales/invoice');
    return pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const visibleNavItems = getNavItems(user?.role);

  return (
    <nav className="sticky top-0 z-50 bg-[#111111] text-white shadow-sm">
      <div className="flex h-12 items-center gap-2 px-3">
        {/* Apps menu (Ctrl+K) + brand */}
        <button
          type="button"
          onClick={openCommandPalette}
          title="Go to any screen (Ctrl+K)"
          aria-label="Open menu (Ctrl+K)"
          data-hotkey="k"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-white/15"
        >
          <LayoutGrid className="h-5 w-5" />
        </button>
        <Link
          href={user?.role === 'admin' ? '/admin' : '/sales'}
          className="mr-2 flex shrink-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-white/10"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
            <Store className="h-4 w-4" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">VibePOS</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {visibleNavItems.map((item, index) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const hotkey = navHotkey(index);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                data-hotkey={hotkey}
                title={hotkey ? `${item.label} (Alt+${hotkey})` : item.label}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13.5px] transition-colors ${
                  active ? 'bg-white/20 font-semibold text-white' : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="hidden h-4 w-4 xl:block" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <CashDrawerWidget
            requestId={cashDrawerRequestId}
            hideTrigger
            onEnabledChange={setCashDrawerEnabled}
          />
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden 2xl:flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1 text-xs text-white/85 hover:bg-white/15"
            title="Search screens (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" /> Search
            <kbd className="rounded border border-white/30 px-1 font-mono text-[10px]">Ctrl+K</kbd>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-hotkey="u"
                className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/10"
                aria-label="User menu (Alt+U)"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#111111] text-sm font-semibold uppercase">
                  {user?.username?.charAt(0) || <User className="h-4 w-4" />}
                </span>
                <span className="hidden md:block text-left leading-tight">
                  <span className="block text-[13px] font-medium">{user?.username}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-white/70">{user?.role}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} className="w-56">
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
              {cashDrawerEnabled && (
                <DropdownMenuItem onSelect={() => setCashDrawerRequestId((requestId) => requestId + 1)}>
                  <Lock className="mr-2 h-4 w-4" />
                  Cash Drawer
                </DropdownMenuItem>
              )}
              {user?.role === 'admin' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Owner tools</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => router.push('/admin/reports/sales')}>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Detailed Reports
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/stock-audit')}>
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Stock Audit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/backup')}>
                    <Database className="mr-2 h-4 w-4" />
                    Backup
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Store Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/updates')}>
                    <Download className="mr-2 h-4 w-4" />
                    Application Updates
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLogoutDialogOpen(true)} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white hover:bg-white/15 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/15 bg-[#111111]">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                    isActive(item.href) ? 'bg-white/20 font-semibold' : 'text-white/85 hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Yes, log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
