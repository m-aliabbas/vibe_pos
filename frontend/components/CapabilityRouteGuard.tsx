'use client';

import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getRouteAccess } from '@/lib/navigation';
import { useAppConfig } from '@/components/AppConfigProvider';

export function CapabilityRouteGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const role = useAuthStore((state) => state.user?.role);
    const authLoading = useAuthStore((state) => state.isLoading);
    const { config, status, hasCapability } = useAppConfig();
    const route = getRouteAccess(pathname, config.application_id);

    const sharedApplicationRoutes = ['/customers', '/users', '/backup', '/settings', '/profile'];
    const workshopRoutes = [
        '/workshop', '/sales', '/inventory', '/stock-audit', '/customers', '/vendors',
        '/purchases', '/returns', '/accounting', '/reports', '/backup', '/users',
        '/settings', '/profile', '/updates', '/admin',
    ];
    const applicationHome = `/${config.application_id}`;
    const isSharedRoute = sharedApplicationRoutes.some((prefix) =>
        pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
    if (
        config.application_id !== 'retail' &&
        pathname !== '/' &&
        pathname !== applicationHome &&
        !isSharedRoute &&
        !(config.application_id === 'workshop' && workshopRoutes.some((prefix) =>
            pathname === prefix || pathname.startsWith(`${prefix}/`)
        )) &&
        pathname !== '/login'
    ) {
        return <AccessDenied />;
    }

    if (!route) return <>{children}</>;

    if (status === 'loading') {
        return (
            <div className="flex h-full items-center justify-center" role="status">
                <p className="text-sm text-gray-600">Loading application configuration...</p>
            </div>
        );
    }

    if (authLoading && route.requiredRoles) {
        return (
            <div className="flex h-full items-center justify-center" role="status">
                <p className="text-sm text-gray-600">Restoring your session...</p>
            </div>
        );
    }

    if (route.requiredRoles && (!role || !route.requiredRoles.includes(role))) {
        return <AccessDenied />;
    }

    if (route.requiredCapability && !hasCapability(route.requiredCapability)) {
        return <AccessDenied />;
    }

    return <>{children}</>;
}

function AccessDenied() {
    return (
        <div className="flex h-full items-center justify-center" role="alert">
            <div className="text-center">
                <h1 className="text-lg font-semibold text-gray-900">Access unavailable</h1>
                <p className="mt-1 text-sm text-gray-600">
                    This page is not enabled for the current application or user.
                </p>
            </div>
        </div>
    );
}
