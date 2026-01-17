'use client';

import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const { user, checkAuth } = useAuthStore();
  const router = useRouter();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (hasRedirected) return;

    const redirect = async () => {
      await checkAuth();
      
      // If no token, redirect to login
      if (!localStorage.getItem('token')) {
        setHasRedirected(true);
        router.replace('/login');
        return;
      }
      
      // Redirect based on user role
      if (user) {
        setHasRedirected(true);
        if (user.role === 'admin') {
          router.replace('/admin');
        } else {
          router.replace('/sales');
        }
      }
    };

    redirect();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
