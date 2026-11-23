import {
  BarChart3,
  ClipboardCheck,
  Database,
  Download,
  Home,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  User,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra words the command palette matches on. */
  keywords?: string;
}

/** Main menu, in the order shown in the top bar (Alt+1 … Alt+0). */
export function getNavItems(role?: string | null): NavItem[] {
  const isAdmin = role === 'admin';
  const items: (NavItem & { show: boolean })[] = [
    { href: isAdmin ? '/admin' : '/sales', label: 'Home', icon: Home, show: true, keywords: 'dashboard' },
    { href: '/sales', label: 'Sales', icon: Store, show: true, keywords: 'pos terminal bill checkout' },
    { href: '/inventory', label: 'Inventory', icon: Package, show: true, keywords: 'products stock items' },
    { href: '/customers', label: 'Customers', icon: UserCheck, show: true, keywords: 'udhar clients' },
    { href: '/vendors', label: 'Vendors', icon: Truck, show: true, keywords: 'suppliers' },
    { href: '/returns', label: 'Returns', icon: RotateCcw, show: true, keywords: 'refund' },
    { href: '/sales/history', label: 'History', icon: Receipt, show: true, keywords: 'invoices sales history' },
    { href: '/accounting', label: 'Accounting', icon: BarChart3, show: isAdmin, keywords: 'ledger expenses journal' },
    { href: '/reports', label: 'Reports', icon: BarChart3, show: isAdmin, keywords: 'analytics' },
    { href: '/users', label: 'Users', icon: Users, show: isAdmin, keywords: 'staff cashiers' },
  ];
  return items.filter((i) => i.show);
}

/** Secondary destinations reachable from the command palette (Ctrl+K). */
export function getMoreItems(role?: string | null): NavItem[] {
  const isAdmin = role === 'admin';
  const items: NavItem[] = [
    { href: '/returns/create', label: 'New Return', icon: RotateCcw, keywords: 'refund create' },
    { href: '/profile', label: 'My Profile', icon: User, keywords: 'password account' },
  ];
  if (isAdmin) {
    items.push(
      { href: '/inventory/purchase', label: 'New Purchase', icon: ShoppingBag, keywords: 'stock in buy vendor bill' },
      { href: '/stock-audit', label: 'Stock Audit', icon: ClipboardCheck, keywords: 'count adjust' },
      { href: '/admin/reports/sales', label: 'Sales Report', icon: BarChart3 },
      { href: '/admin/reports/purchases', label: 'Purchases Report', icon: BarChart3 },
      { href: '/admin/reports/inventory', label: 'Inventory Report', icon: BarChart3 },
      { href: '/admin/reports/financial', label: 'Financial Report', icon: BarChart3, keywords: 'profit loss' },
      { href: '/admin/reports/users', label: 'Users Report', icon: BarChart3 },
      { href: '/backup', label: 'Backup', icon: Database },
      { href: '/settings', label: 'Store Settings', icon: Settings, keywords: 'invoice printer whatsapp' },
      { href: '/updates', label: 'Application Updates', icon: Download },
    );
  }
  return items;
}

/** Hotkey digit for the n-th top-bar item (1…9, then 0). */
export function navHotkey(index: number): string | undefined {
  if (index < 9) return String(index + 1);
  if (index === 9) return '0';
  return undefined;
}
