'use client';

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { cashRegisterApi, CashRegisterSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Wallet, Lock } from 'lucide-react';

const currency = (value: number) => `Rs ${value.toFixed(2)}`;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};

interface CashDrawerWidgetProps {
  requestId?: number;
  hideTrigger?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}

export function CashDrawerWidget({ requestId = 0, hideTrigger = false, onEnabledChange }: CashDrawerWidgetProps) {
  const { user } = useAuthStore();
  const [enabled, setEnabled] = useState(false);
  const [session, setSession] = useState<CashRegisterSession | null>(null);
  const [openDialog, setOpenDialog] = useState<'open' | 'close' | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closedSummary, setClosedSummary] = useState<CashRegisterSession | null>(null);
  const handledRequestId = useRef(0);

  const refreshStatus = React.useCallback(async () => {
    if (!user) return;
    try {
      const data = await cashRegisterApi.getStatus();
      setEnabled(data.enabled);
      onEnabledChange?.(data.enabled);
      setSession(data.session);
    } catch {
      // If the feature endpoint is unreachable, fail silently and hide the widget.
      onEnabledChange?.(false);
    }
  }, [onEnabledChange, user]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!enabled || requestId <= handledRequestId.current) return;
    handledRequestId.current = requestId;
    setError(null);
    setOpenDialog(session ? 'close' : 'open');
  }, [enabled, requestId, session]);

  if (!user || !enabled) return null;

  const handleOpen = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const created = await cashRegisterApi.open(Number(amount) || 0);
      setSession(created);
      setOpenDialog(null);
      setAmount('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to open cash drawer'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const closed = await cashRegisterApi.close(Number(amount) || 0);
      setSession(null);
      setClosedSummary(closed);
      setOpenDialog(null);
      setAmount('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to close cash drawer'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {!hideTrigger && session ? (
        <Button
          variant="outline"
          size="sm"
          className="hidden md:flex items-center gap-2"
          onClick={() => { setOpenDialog('close'); setError(null); }}
        >
          <Wallet className="h-4 w-4 text-emerald-600" />
          <span className="text-xs">Drawer open</span>
          <Badge variant="secondary">{currency(session.opening_cash)}</Badge>
        </Button>
      ) : !hideTrigger ? (
        <Button
          variant="outline"
          size="sm"
          className="hidden md:flex items-center gap-2 border-amber-300 text-amber-700"
          onClick={() => { setOpenDialog('open'); setError(null); }}
        >
          <Lock className="h-4 w-4" />
          Open Cash Drawer
        </Button>
      ) : null}

      <Dialog open={openDialog === 'open'} onOpenChange={(value) => !value && setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open Cash Drawer</DialogTitle>
            <DialogDescription>
              Enter the starting cash amount in your drawer for this shift.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="opening-cash">Opening cash</Label>
            <Input
              id="opening-cash"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancel</Button>
            <Button onClick={handleOpen} disabled={submitting || amount === ''}>
              {submitting ? 'Opening...' : 'Open Drawer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'close'} onOpenChange={(value) => !value && setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Cash Drawer</DialogTitle>
            <DialogDescription>
              Count the cash in your drawer and enter the total below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="closing-cash">Counted cash</Label>
            <Input
              id="closing-cash"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancel</Button>
            <Button onClick={handleClose} disabled={submitting || amount === ''}>
              {submitting ? 'Closing...' : 'Close Drawer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!closedSummary} onOpenChange={(value) => !value && setClosedSummary(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cash Drawer Closed</DialogTitle>
            <DialogDescription>Here is your shift summary.</DialogDescription>
          </DialogHeader>
          {closedSummary && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Opening cash</span><span>{currency(closedSummary.opening_cash)}</span></div>
              <div className="flex justify-between"><span>Expected cash</span><span>{currency(closedSummary.expected_cash || 0)}</span></div>
              <div className="flex justify-between"><span>Counted cash</span><span>{currency(closedSummary.closing_cash || 0)}</span></div>
              <div className={`flex justify-between font-semibold ${((closedSummary.difference || 0) < 0) ? 'text-red-600' : 'text-emerald-600'}`}>
                <span>Difference</span><span>{currency(closedSummary.difference || 0)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setClosedSummary(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
