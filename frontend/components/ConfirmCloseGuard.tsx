'use client';

import { useEffect, useRef, useState } from 'react';
import type { CloseRequestedEvent } from '@tauri-apps/api/window';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function ConfirmCloseGuard() {
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  // Expose a function that shows the dialog and returns a promise
  const confirmClose = (): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOpen(true);
    });
  };

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
          const shouldClose = await confirmClose();
          if (shouldClose) {
            await appWindow.destroy();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = () => {
    setOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  };

  const handleCancel = () => {
    setOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close Application</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to close the app? Any unsaved changes may be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Close</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
