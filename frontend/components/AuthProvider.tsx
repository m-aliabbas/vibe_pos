'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { discoverBackend } from '@/lib/discovery';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const checkAuth = useAuthStore((state) => state.checkAuth);

    useEffect(() => {
        async function init() {
            await discoverBackend();
            checkAuth();
        }
        init();
    }, [checkAuth]);

    return <>{children}</>;
}

export function useAuth() {
    return useAuthStore();
}
