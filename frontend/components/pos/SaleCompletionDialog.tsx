'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, FileText } from 'lucide-react';

interface SaleCompletionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    saleId: number | null;
    saleTotal: number;
    previousBalance: number;
    amountPaid: number;
    change: number;
    onViewInvoice: () => void;
    onNewSale: () => void;
}

export function SaleCompletionDialog({
    open,
    onOpenChange,
    saleId,
    saleTotal,
    previousBalance,
    amountPaid,
    change,
    onViewInvoice,
    onNewSale,
}: SaleCompletionDialogProps) {
    const due = Math.max(0, saleTotal - amountPaid);
    const totalCustomerBalance = previousBalance + due;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-6 w-6" />
                        Sale Completed!
                    </DialogTitle>
                    <DialogDescription>The sale has been successfully processed.</DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-4">
                    <div className="text-center pb-4 border-b">
                        <p className="text-sm text-muted-foreground mb-1">Sale ID</p>
                        <p className="text-2xl font-bold">#{saleId}</p>
                    </div>

                    <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Current Bill:</span>
                            <span className="text-xl font-bold text-primary">rs {saleTotal.toFixed(2)}</span>
                        </div>
                        {Math.abs(previousBalance) > 0.005 && (
                            <>
                                <div className="flex justify-between items-center text-orange-700">
                                    <span className="text-sm font-medium">Previous Balance:</span>
                                    <span className="text-lg font-semibold">rs {previousBalance.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center border-t pt-2">
                                    <span className="text-base font-bold">Grand Total:</span>
                                    <span className="text-2xl font-bold text-primary">
                                        rs {(saleTotal + previousBalance).toFixed(2)}
                                    </span>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Amount Paid:</span>
                            <span className="text-xl font-semibold text-green-600">rs {amountPaid.toFixed(2)}</span>
                        </div>

                        {change > 0 && (
                            <div className="flex justify-between items-center pt-3 border-t-2 border-green-600">
                                <span className="text-base font-bold text-green-700">Change to Return:</span>
                                <span className="text-3xl font-bold text-green-700">rs {change.toFixed(2)}</span>
                            </div>
                        )}

                        {amountPaid < saleTotal && (
                            <div className="flex justify-between items-center pt-3 border-t-2 border-red-600">
                                <span className="text-base font-bold text-red-700">Amount Due (Udhar):</span>
                                <span className="text-3xl font-bold text-red-700">rs {due.toFixed(2)}</span>
                            </div>
                        )}
                        {Math.abs(previousBalance) > 0.005 && totalCustomerBalance > 0 && (
                            <div className="flex justify-between items-center pt-3 border-t-2 border-red-600">
                                <span className="text-base font-bold text-red-700">Total Customer Balance:</span>
                                <span className="text-3xl font-bold text-red-700">rs {totalCustomerBalance.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row">
                    <Button variant="outline" onClick={onViewInvoice} className="w-full sm:w-auto">
                        <FileText className="mr-2 h-4 w-4" />
                        View Invoice
                    </Button>
                    <Button onClick={onNewSale} className="w-full sm:w-auto">
                        New Sale
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}