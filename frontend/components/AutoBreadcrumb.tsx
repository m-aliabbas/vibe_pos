'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const LABELS: Record<string, string> = {
    admin: 'Dashboard',
    'stock-audit': 'Stock Audit',
    'sales': 'Sales',
    history: 'History',
    invoice: 'Invoice',
    purchase: 'New Purchase',
    create: 'New',
    variations: 'Variations',
};

function labelFor(segment: string) {
    if (/^\d+$/.test(segment)) return `#${segment}`;
    if (LABELS[segment]) return LABELS[segment];
    return segment
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/** Odoo-style control panel strip: breadcrumb on the left, keyboard hints on the right. */
export function AutoBreadcrumb() {
    const pathname = usePathname();
    const { user } = useAuthStore();

    if (pathname === '/login' || !user) return null;

    const pathSegments = pathname.split('/').filter(Boolean);
    const crumbs = pathSegments.map((segment, index) => ({
        href: `/${pathSegments.slice(0, index + 1).join('/')}`,
        label: labelFor(segment),
    }));
    const homeHref = user.role === 'admin' ? '/admin' : '/sales';

    return (
        <div className="flex items-center justify-between gap-4 border-b bg-white px-4 py-1.5">
            <nav aria-label="Breadcrumb" className="min-w-0">
                <ol className="flex min-w-0 items-center gap-1 text-sm">
                    {crumbs.length === 0 && <li className="text-base font-semibold text-gray-900">Home</li>}
                    {crumbs.length > 0 && (
                        <li>
                            <Link href={homeHref} className="text-[#714b67] hover:underline">
                                Home
                            </Link>
                        </li>
                    )}
                    {crumbs.map((crumb, index) => {
                        const isLast = index === crumbs.length - 1;
                        return (
                            <React.Fragment key={crumb.href}>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                                <li className="truncate">
                                    {isLast ? (
                                        <span aria-current="page" className="text-base font-semibold text-gray-900">
                                            {crumb.label}
                                        </span>
                                    ) : (
                                        <Link href={crumb.href} className="text-[#714b67] hover:underline">
                                            {crumb.label}
                                        </Link>
                                    )}
                                </li>
                            </React.Fragment>
                        );
                    })}
                </ol>
            </nav>
            <p className="hidden shrink-0 items-center gap-2 text-[11px] text-muted-foreground lg:flex">
                <span><kbd className="kbd">Alt</kbd> keys</span>
                <span><kbd className="kbd">Ctrl+K</kbd> go to</span>
                <span><kbd className="kbd">/</kbd> search</span>
                <span><kbd className="kbd">↑↓</kbd> rows</span>
                <span><kbd className="kbd">?</kbd> help</span>
            </p>
        </div>
    );
}
