'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingUp, CreditCard, Lock } from "lucide-react";

interface CreditLimitAlertProps {
  open: boolean;
  onClose: () => void;
  customerName?: string;
  limit: number;
  current: number;
  available: number;
  attempted?: number;
}

/** Parse HTTP 400 detail string from backend credit limit errors. */
export function parseCreditLimitError(detail: string): {
  limit: number;
  current: number;
  available: number;
} | null {
  const limitMatch = detail.match(/Limit:\s*([\d.]+)/i);
  const currentMatch = detail.match(/Current:\s*([\d.]+)/i);
  const availableMatch = detail.match(/Available(?:[^:]*)?:\s*([\d.]+)/i);
  if (!limitMatch || !currentMatch || !availableMatch) return null;
  return {
    limit: parseFloat(limitMatch[1]),
    current: parseFloat(currentMatch[1]),
    available: parseFloat(availableMatch[1]),
  };
}

function fmt(n: number) {
  return `Rs ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

export function CreditLimitAlert({
  open,
  onClose,
  customerName,
  limit,
  current,
  available,
  attempted,
}: CreditLimitAlertProps) {
  const usedPercent = limit > 0 ? Math.min(100, (current / limit) * 100) : 100;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Red header bar */}
        <div className="bg-red-600 px-6 py-5 text-white">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white/20 p-2">
                <Lock className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg font-semibold leading-tight">
                  Credit Limit Exceeded
                </DialogTitle>
                {customerName && (
                  <p className="text-red-100 text-sm mt-0.5">{customerName}</p>
                )}
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Credit used</span>
              <span className="font-medium text-red-600">{usedPercent.toFixed(0)}%</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-red-500 transition-all"
                style={{ width: `${usedPercent}%` }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-gray-50 p-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <CreditCard className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-[11px] text-muted-foreground">Credit Limit</p>
              <p className="text-sm font-bold mt-0.5">{fmt(limit)}</p>
            </div>
            <div className="rounded-lg border bg-red-50 border-red-200 p-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <TrendingUp className="h-4 w-4 text-red-400" />
              </div>
              <p className="text-[11px] text-muted-foreground">Outstanding</p>
              <p className="text-sm font-bold text-red-600 mt-0.5">{fmt(current)}</p>
            </div>
            <div className="rounded-lg border bg-gray-50 p-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-[11px] text-muted-foreground">Available</p>
              <p className="text-sm font-bold text-amber-600 mt-0.5">{fmt(available)}</p>
            </div>
          </div>

          {/* Message */}
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex gap-3 items-start">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800 leading-snug">
              {attempted && attempted > 0
                ? <>This transaction would add <strong>{fmt(attempted)}</strong> to the balance, exceeding the credit limit by <strong>{fmt(attempted - available)}</strong>.</>
                : <>The outstanding balance has reached the credit limit. Collect a payment before adding more credit.</>
              }
            </p>
          </div>

          <Button className="w-full" onClick={onClose}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
