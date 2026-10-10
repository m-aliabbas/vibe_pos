"use client";

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { storeSettingsApi, type LicenseStatus } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export function LicenseExpiryBanner() {
  const user = useAuthStore(state => state.user);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    storeSettingsApi.getLicenseStatus()
      .then(status => {
        if (!cancelled) setLicenseStatus(status);
      })
      .catch(() => {
        if (!cancelled) setLicenseStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (
    !user
    || !licenseStatus?.enforced
    || licenseStatus.days_remaining === null
    || licenseStatus.days_remaining > 5
  ) {
    return null;
  }

  const dayLabel = licenseStatus.days_remaining === 1 ? 'day' : 'days';

  return (
    <div className="no-print shrink-0 border-y-2 border-red-700 bg-red-600 px-4 py-3 text-white shadow-lg" role="alert">
      <div className="mx-auto flex max-w-7xl items-start justify-center gap-3 text-center sm:items-center">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 sm:mt-0" />
        <div className="font-semibold">
          <span className="text-lg font-extrabold">
            {licenseStatus.days_remaining} {dayLabel} remaining until license expiry.
          </span>{' '}
          If you have already paid, ignore this message. Otherwise, contact Vibe.exe:{' '}
          <a className="underline underline-offset-2" href="tel:03025114945">03025114945</a>
          {' / '}
          <a className="underline underline-offset-2" href="tel:03402040648">03402040648</a>
          {' / '}
          <a className="underline underline-offset-2" href="mailto:info@vibeexe.com">info@vibeexe.com</a>
          {' / '}
          <a className="underline underline-offset-2" href="https://www.vibeexe.com" target="_blank" rel="noreferrer">www.vibeexe.com</a>
        </div>
      </div>
    </div>
  );
}
