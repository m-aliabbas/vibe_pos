'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppConfig } from '@/components/AppConfigProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getNavigationItems } from '@/lib/navigation';
import { useAuthStore } from '@/store/authStore';
import type { ApplicationId } from '@/lib/api';

export function ApplicationWorkspace({ expectedApplication }: { expectedApplication: ApplicationId }) {
    const router = useRouter();
    const { config, status, hasCapability } = useAppConfig();
    const { user, token, isLoading } = useAuthStore();

    useEffect(() => {
        if (!isLoading && !token) router.replace('/login');
    }, [isLoading, router, token]);

    if (status === 'loading' || isLoading) {
        return (
            <div className="flex h-full items-center justify-center" role="status">
                <p className="text-sm text-muted-foreground">Loading workspace...</p>
            </div>
        );
    }

    if (status !== 'ready' || config.application_id !== expectedApplication) {
        return (
            <div className="flex h-full items-center justify-center p-6" role="alert">
                <div className="max-w-md text-center">
                    <h1 className="text-lg font-semibold">Application configuration mismatch</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        This desktop target is configured for {expectedApplication}, but the backend reports {config.application_id}.
                    </p>
                </div>
            </div>
        );
    }

    if (!user) return null;

    const navigation = getNavigationItems(
        'navbar',
        user.role,
        hasCapability,
        config.application_id,
    ).filter((entry) => entry.id !== 'home');

    return (
        <div className="h-full overflow-y-auto bg-gray-50">
            <header className="border-b bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{config.profile_id}</p>
                <h1 className="mt-1 text-2xl font-semibold text-gray-900">{config.application_name}</h1>
                {config.branding.name && (
                    <p className="mt-1 text-sm text-muted-foreground">{config.branding.name}</p>
                )}
            </header>
            <main className="mx-auto max-w-5xl space-y-6 p-6">
                <section aria-labelledby="workspace-heading">
                    <h2 id="workspace-heading" className="text-lg font-semibold text-gray-900">Workspace</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The shared application shell is active. Domain workflows will appear when this application module is enabled.
                    </p>
                </section>
                {navigation.length > 0 && (
                    <nav aria-label={`${config.application_name} navigation`} className="flex flex-wrap gap-2">
                        {navigation.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Button key={item.id} variant="outline" asChild>
                                    <Link href={item.href}>
                                        <Icon aria-hidden="true" />
                                        {item.label || item.description || item.id}
                                    </Link>
                                </Button>
                            );
                        })}
                    </nav>
                )}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{user.username}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Signed in to {config.application_name} as {user.role}.
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
