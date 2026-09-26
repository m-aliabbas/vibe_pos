'use client';

import { useAuthStore } from '@/store/authStore';
import { useAppConfig } from '@/components/AppConfigProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const { config, status } = useAppConfig();
  const router = useRouter();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (hasRedirected || status === 'loading') return;

    const redirect = async () => {
      await checkAuth();

      if (!sessionStorage.getItem('token')) {
        setHasRedirected(true);
        router.replace('/login');
        return;
      }

      setHasRedirected(true);
      router.replace(config.application_id === 'retail' ? '/sales' : `/${config.application_id}`);
    };

    void redirect();
  }, [checkAuth, config.application_id, hasRedirected, router, status]);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
