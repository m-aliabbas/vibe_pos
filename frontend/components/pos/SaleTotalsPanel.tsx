'use client';

import { Button } from '@/components/ui/button';
import { DollarSign } from 'lucide-react';

interface SaleTotalsPanelProps {
    totalQuantity: number;
    subtotal: number;
    discount: number;
    showDiscount: boolean;
    tax: number;
    deliveryCharges: number;
    previousBalance?: number;
    grandTotal: number;
    onCheckout: () => void;
    onHold: () => void;
}

export function SaleTotalsPanel({
    totalQuantity,
    subtotal,
    discount,
    showDiscount,
    tax,
    deliveryCharges,
    previousBalance,
    grandTotal,
    onCheckout,
    onHold,
}: SaleTotalsPanelProps) {
    return (
        <div className="border-t bg-gray-50 overflow-y-auto" style={{ flex: 1, minHeight: 110 }}>
            <div className="flex gap-3 p-3 items-start">
                <div className="flex-1 flex flex-col gap-1 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Qty:</span>
                        <span className="font-medium tabular-nums">{totalQuantity}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Sub Total:</span>
                        <span className="font-medium tabular-nums">rs {subtotal.toFixed(2)}</span>
                    </div>
                    {showDiscount && (
                        <div className="flex justify-between text-red-600">
                            <span>Discount:</span>
                            <span className="tabular-nums">-rs {discount.toFixed(2)}</span>
                        </div>
                    )}
                    {tax > 0 && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Tax:</span>
                            <span className="tabular-nums">+rs {tax.toFixed(2)}</span>
                        </div>
                    )}
                    {deliveryCharges > 0 && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Delivery:</span>
                            <span className="tabular-nums">+rs {deliveryCharges.toFixed(2)}</span>
                        </div>
                    )}
                    {previousBalance !== undefined && Math.abs(previousBalance) > 0.005 && (
                        <div className="flex justify-between text-orange-700">
                            <span>Previous Balance:</span>
                            <span className="tabular-nums">
                                {previousBalance >= 0 ? '+' : '-'}rs {Math.abs(previousBalance).toFixed(2)}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between border-t pt-1 mt-0.5 font-bold text-base">
                        <span>Grand Total</span>
                        <span className="text-primary text-lg tabular-nums">rs {grandTotal.toFixed(2)}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-2 w-40 shrink-0">
                    <Button
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xs"
                        size="sm"
                        onClick={onCheckout}
                    >
                        <DollarSign className="h-3.5 w-3.5 mr-1 shrink-0" />Checkout (Ctrl+M)
                    </Button>
                    <Button
                        size="sm"
                        className="w-full bg-red-700 hover:bg-red-800 text-white font-semibold text-xs"
                        onClick={onHold}
                    >
                        Hold (Ctrl+H)
                    </Button>
                </div>
            </div>
        </div>
    );
}