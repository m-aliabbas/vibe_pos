'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { appConfigApi, type AppConfigResponse, type CapabilityId } from '@/lib/api';

type AppConfigStatus = 'loading' | 'ready' | 'unavailable';

interface AppConfigContextValue {
    config: AppConfigResponse;
    status: AppConfigStatus;
    source: 'backend' | 'fallback';
    hasCapability: (capability: CapabilityId) => boolean;
    refresh: () => Promise<void>;
}

const retailFallbackConfig: AppConfigResponse = {
    application_id: 'retail',
    application_name: 'VibePOS',
    application_version: 'unknown',
    schema_version: 'unknown',
    profile_id: 'retail',
    enabled_modules: [],
    enabled_capabilities: [
        'platform.authentication',
        'platform.users',
        'platform.store-configuration',
        'shared.customer-identity',
        'shared.payments',
        'shared.invoices',
        'shared.printing',
        'shared.reporting',
        'shared.permissions',
        'shared.audit',
        'retail.catalog',
        'retail.inventory',
        'retail.purchasing',
        'retail.sales',
        'retail.returns',
        'retail.accounting',
        'retail.holds',
        'infrastructure.backup',
        'infrastructure.files',
        'infrastructure.messaging',
    ],
    shared_package_versions: {},
    bootstrap_required: false,
    branding: {
        name: '',
        address: '',
        phone: '',
        email: '',
        city: '',
        tax_id: '',
        website: '',
    },
};

const AppConfigContext = createContext<AppConfigContextValue | null>(null);

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState(retailFallbackConfig);
    const [status, setStatus] = useState<AppConfigStatus>('loading');
    const [source, setSource] = useState<'backend' | 'fallback'>('fallback');

    const loadConfig = async () => {
        try {
            return {
                config: await appConfigApi.get(),
                status: 'ready' as const,
                source: 'backend' as const,
            };
        } catch {
            return {
                config: retailFallbackConfig,
                status: 'unavailable' as const,
                source: 'fallback' as const,
            };
        }
    };

    const refresh = async () => {
        setStatus('loading');
        const result = await loadConfig();
        setConfig(result.config);
        setStatus(result.status);
        setSource(result.source);
    };

    useEffect(() => {
        let active = true;
        void loadConfig().then((result) => {
            if (!active) return;
            setConfig(result.config);
            setStatus(result.status);
            setSource(result.source);
        });

        return () => {
            active = false;
        };
    }, []);

    const value: AppConfigContextValue = {
        config,
        status,
        source,
        hasCapability: (capability) => config.enabled_capabilities.includes(capability),
        refresh,
    };

    return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig() {
    const context = useContext(AppConfigContext);
    if (!context) {
        throw new Error('useAppConfig must be used within AppConfigProvider');
    }
    return context;
}