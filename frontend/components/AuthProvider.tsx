'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const checkAuth = useAuthStore((state) => state.checkAuth);

    useEffect(() => {
        // Check auth on mount to restore session from localStorage
        checkAuth();
    }, [checkAuth]);

    return <>{children}</>;
}
