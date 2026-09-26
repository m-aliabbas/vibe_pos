'use client';

import type { Ref } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export interface CheckoutPaymentSummary {
    subtotal: number;
    totalDiscount: number;
    showDiscount: boolean;
    afterDiscount: number;
    tax: number;
    deliveryCharges: number;
    previousBalance?: number;
    grandTotal: number;
    newBillDue?: number;
    customerBalanceAfterPayment?: number;
    change?: number;
    amountPaid: number;
}

interface CheckoutPaymentSectionProps {
    deliveryCharges: number;
    onDeliveryChargesChange: (value: number) => void;
    paymentMethod: string;
    onPaymentMethodChange: (value: string) => void;
    discount: number;
    onDiscountChange: (value: number) => void;
    tax: number;
    onTaxChange: (value: number) => void;
    amountPaid: string;
    onAmountPaidChange: (value: string) => void;
    amountPaidInputRef: Ref<HTMLInputElement>;
    amountPaidInWords: string;
    summary: CheckoutPaymentSummary;
}

export function CheckoutPaymentSection({
    deliveryCharges,
    onDeliveryChargesChange,
    paymentMethod,
    onPaymentMethodChange,
    discount,
    onDiscountChange,
    tax,
    onTaxChange,
    amountPaid,
    onAmountPaidChange,
    amountPaidInputRef,
    amountPaidInWords,
    summary,
}: CheckoutPaymentSectionProps) {
    return (
        <>
            <div className="space-y-1 pt-2">
                <Label htmlFor="delivery" className="text-sm">
                    Delivery Charges (rs)
                </Label>
                <Input
                    id="delivery"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={deliveryCharges || ''}
                    onChange={(event) => onDeliveryChargesChange(parseFloat(event.target.value) || 0)}
                />
            </div>

            <div className="space-y-1">
                <Label htmlFor="payment" className="text-sm">
                    Payment Method
                </Label>
                <Select value={paymentMethod} onValueChange={onPaymentMethodChange}>
                    <SelectTrigger id="payment" className="h-8 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="mobile">Mobile Payment</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <Label htmlFor="discount" className="text-sm">
                        Global Discount (rs)
                    </Label>
                    <Input
                        id="discount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={discount}
                        onChange={(event) => onDiscountChange(parseFloat(event.target.value) || 0)}
                        className="text-xs h-8"
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="tax" className="text-sm">
                        Tax (rs)
                    </Label>
                    <Input
                        id="tax"
                        type="number"
                        min="0"
                        step="0.01"
                        value={tax}
                        onChange={(event) => onTaxChange(parseFloat(event.target.value) || 0)}
                        className="text-xs h-8"
                    />
                </div>
            </div>

            <div className="space-y-1">
                <Label htmlFor="amountPaid" className="text-sm">
                    Amount Paid (rs)
                </Label>
                <Input
                    ref={amountPaidInputRef}
                    id="amountPaid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaid}
                    onChange={(event) => onAmountPaidChange(event.target.value)}
                    className="text-sm font-semibold h-8"
                />
                <p className="text-xs text-muted-foreground">Amount received from customer</p>
                {amountPaidInWords && (
                    <p className="text-xs font-medium text-primary">In words: {amountPaidInWords}</p>
                )}
            </div>

            <div className="border-t pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>rs {summary.subtotal.toFixed(2)}</span>
                </div>

                {summary.showDiscount && (
                    <div className="flex justify-between text-red-600">
                        <span>Total Discount:</span>
                        <span>-rs {summary.totalDiscount.toFixed(2)}</span>
                    </div>
                )}

                {summary.showDiscount && (
                    <div className="flex justify-between font-semibold border-t pt-1">
                        <span>After Discount:</span>
                        <span>rs {summary.afterDiscount.toFixed(2)}</span>
                    </div>
                )}

                {summary.tax > 0 && (
                    <div className="flex justify-between">
                        <span>Tax:</span>
                        <span>+rs {summary.tax.toFixed(2)}</span>
                    </div>
                )}

                {summary.deliveryCharges > 0 && (
                    <div className="flex justify-between">
                        <span>Delivery:</span>
                        <span>+rs {summary.deliveryCharges.toFixed(2)}</span>
                    </div>
                )}

                {summary.previousBalance !== undefined && Math.abs(summary.previousBalance) > 0.005 && (
                    <div className="flex justify-between text-orange-700 font-semibold">
                        <span>Previous Balance:</span>
                        <span>
                            {summary.previousBalance >= 0 ? '+' : '-'}rs {Math.abs(summary.previousBalance).toFixed(2)}
                        </span>
                    </div>
                )}

                <div className="flex justify-between font-bold border-t-2 pt-1 mt-1">
                    <span>GRAND TOTAL:</span>
                    <span className="text-lg">rs {summary.grandTotal.toFixed(2)}</span>
                </div>

                {summary.newBillDue !== undefined && (
                    <div className="flex justify-between text-red-600 font-semibold">
                        <span>New Bill Due (Udhar):</span>
                        <span>rs {summary.newBillDue.toFixed(2)}</span>
                    </div>
                )}

                {summary.customerBalanceAfterPayment !== undefined && (
                    <div className="flex justify-between text-red-700 font-bold">
                        <span>Total Balance After Payment:</span>
                        <span>rs {summary.customerBalanceAfterPayment.toFixed(2)}</span>
                    </div>
                )}

                {summary.change !== undefined && (
                    <div className="flex justify-between text-green-600 font-semibold">
                        <span>Change:</span>
                        <span>rs {summary.change.toFixed(2)}</span>
                    </div>
                )}
            </div>

            <div className="bg-primary/10 p-2 rounded border border-primary/20">
                <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm">Amount Paid:</span>
                    <span className="text-xl font-bold text-primary">rs {summary.amountPaid.toFixed(2)}</span>
                </div>
            </div>
        </>
    );
}