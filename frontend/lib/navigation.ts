import type { LucideIcon } from 'lucide-react';
import {
    BarChart3,
    Database,
    Download,
    Home,
    Package,
    Receipt,
    RotateCcw,
    Settings,
    Store,
    Tags,
    Truck,
    UserCheck,
    Users,
} from 'lucide-react';
import type { ApplicationId, CapabilityId } from '@/lib/api';

export type NavigationSurface = 'navbar' | 'admin';

export interface NavigationEntry {
    id: string;
    href: string;
    label: string;
    icon: LucideIcon;
    surfaces: NavigationSurface[];
    requiredRoles?: string[];
    requiredCapability?: CapabilityId;
    description?: string;
    routeGuard?: boolean;
}

export const navigationRegistry: NavigationEntry[] = [
    {
        id: 'home', href: '/admin', label: 'Home', icon: Home,
        surfaces: ['navbar'], routeGuard: true,
    },
    {
        id: 'dashboard', href: '/admin', label: 'Dashboard', icon: Home,
        surfaces: ['admin'], requiredRoles: ['admin'], routeGuard: true,
        description: 'Overview and key metrics',
    },
    {
        id: 'sales', href: '/sales', label: 'Sales', icon: Store,
        surfaces: ['navbar', 'admin'], requiredCapability: 'retail.sales', routeGuard: true,
        description: 'Create new orders',
    },
    {
        id: 'inventory', href: '/inventory', label: 'Inventory', icon: Package,
        surfaces: ['navbar', 'admin'], requiredCapability: 'retail.inventory', routeGuard: true,
        description: 'Manage products and stock',
    },
    {
        id: 'stock-audit', href: '/stock-audit', label: 'Stock Audit', icon: Tags,
        surfaces: ['admin'], requiredRoles: ['admin'], requiredCapability: 'retail.inventory',
        routeGuard: true, description: 'Batch costing and audit',
    },
    {
        id: 'customers', href: '/customers', label: 'Customers', icon: UserCheck,
        surfaces: ['navbar'], requiredCapability: 'shared.customer-identity', routeGuard: true,
    },
    {
        id: 'vendors', href: '/vendors', label: 'Vendors', icon: Truck,
        surfaces: ['navbar', 'admin'], requiredCapability: 'retail.purchasing', routeGuard: true,
        description: 'Manage suppliers',
    },
    {
        id: 'returns', href: '/returns', label: 'Returns', icon: RotateCcw,
        surfaces: ['navbar'], requiredCapability: 'retail.returns', routeGuard: true,
    },
    {
        id: 'history', href: '/sales/history', label: 'History', icon: Receipt,
        surfaces: ['navbar'], requiredCapability: 'retail.sales', routeGuard: true,
    },
    {
        id: 'accounting', href: '/accounting', label: 'Accounts', icon: BarChart3,
        surfaces: ['navbar'], requiredRoles: ['admin'], requiredCapability: 'retail.accounting',
        routeGuard: true,
    },
    {
        id: 'reports', href: '/reports', label: 'Reports', icon: BarChart3,
        surfaces: ['navbar', 'admin'], requiredRoles: ['admin'], requiredCapability: 'shared.reporting',
        routeGuard: true, description: 'Inventory, products, buying and customers',
    },
    {
        id: 'admin-reports', href: '/admin/reports', label: 'Admin Reports', icon: BarChart3,
        surfaces: [], requiredRoles: ['admin'], requiredCapability: 'shared.reporting', routeGuard: true,
    },
    {
        id: 'users', href: '/users', label: 'Users', icon: Users,
        surfaces: ['navbar', 'admin'], requiredRoles: ['admin'], requiredCapability: 'platform.users',
        routeGuard: true, description: 'Manage users and roles',
    },
    {
        id: 'backup', href: '/backup', label: '', icon: Database,
        surfaces: ['navbar', 'admin'], requiredRoles: ['admin'], requiredCapability: 'infrastructure.backup',
        routeGuard: true, description: 'Database backup management',
    },
    {
        id: 'updates', href: '/updates', label: 'Application Updates', icon: Download,
        surfaces: ['admin'], requiredRoles: ['admin'], routeGuard: true,
        description: 'Check for new VibePOS releases',
    },
    {
        id: 'settings', href: '/settings', label: 'Store Settings', icon: Settings,
        surfaces: [], requiredRoles: ['admin'], requiredCapability: 'platform.store-configuration',
        routeGuard: true,
    },
];

export function getNavigationItems(
    surface: NavigationSurface,
    role: string,
    hasCapability: (capability: CapabilityId) => boolean,
    applicationId: ApplicationId = 'retail',
) {
    const independentShellItems = new Set(['home', 'customers', 'users', 'backup']);
    return navigationRegistry
        .filter((entry) => entry.surfaces.includes(surface))
        .filter((entry) => applicationId === 'retail' || independentShellItems.has(entry.id))
        .filter((entry) => !entry.requiredRoles || entry.requiredRoles.includes(role))
        .filter((entry) => !entry.requiredCapability || hasCapability(entry.requiredCapability))
        .map((entry) => entry.id === 'home'
            ? {
                ...entry,
                href: applicationId === 'retail'
                    ? role === 'admin' ? '/admin' : '/sales'
                    : `/${applicationId}`,
            }
            : entry);
}

export function getRouteAccess(pathname: string) {
    return navigationRegistry
        .filter((entry) => entry.routeGuard && (
            pathname === entry.href || pathname.startsWith(`${entry.href}/`)
        ))
        .sort((left, right) => right.href.length - left.href.length)[0];
}