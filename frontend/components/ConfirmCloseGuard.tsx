'use client';

import { useEffect } from 'react';
import type { CloseRequestedEvent } from '@tauri-apps/api/window';

export function ConfirmCloseGuard() {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    let unlisten: (() => void) | undefined;

    const setupTauriCloseConfirm = async () => {
      if (!('__TAURI__' in window)) {
        return;
      }

      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onCloseRequested(async (event: CloseRequestedEvent) => {
          event.preventDefault();
          const shouldClose = window.confirm('Are you sure you want to close the app?');
          if (shouldClose) {
            await appWindow.close();
          }
        });
      } catch (error) {
        console.error('Failed to register Tauri close handler', error);
      }
    };

    setupTauriCloseConfirm();

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return null;
}
