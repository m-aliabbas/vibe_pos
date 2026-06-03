'use client';

import { useEffect, useState } from 'react';
import { stockAuditApi, BatchSummaryByProduct } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
    productId: number;
    productName: string;
    open: boolean;
    onClose: () => void;
}

const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    depleted: 'bg-gray-100 text-gray-600',
    merged: 'bg-blue-100 text-blue-700',
};

function fmt(n: number) {
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BatchModal({ productId, productName, open, onClose }: Props) {
    const router = useRouter();
    const [data, setData] = useState<BatchSummaryByProduct | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        stockAuditApi.getProductBatches(productId)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [open, productId]);

    return (
        <Dialog open={open} onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <DialogTitle>Stock Batches — {productName}</DialogTitle>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-indigo-600 text-xs"
                            onClick={() => { onClose(); router.push(`/stock-audit?product_id=${productId}`); }}
                        >
                            <ExternalLink className="w-3 h-3 mr-1" /> Full Audit
                        </Button>
                    </div>
                </DialogHeader>

                {loading && <div className="text-center py-8 text-gray-400">Loading batches...</div>}

                {!loading && data && (
                    <>
                        <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                            <div className="bg-indigo-50 rounded-lg p-3 text-center">
                                <div className="text-gray-500">Total Qty</div>
                                <div className="font-bold text-lg">{fmt(data.total_qty)}</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                                <div className="text-gray-500">Avg Cost</div>
                                <div className="font-bold text-lg">Rs {fmt(data.avg_cost)}</div>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-3 text-center">
                                <div className="text-gray-500">Total Value</div>
                                <div className="font-bold text-lg">Rs {fmt(data.total_value)}</div>
                            </div>
                        </div>

                        <div className="rounded-lg border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50">
                                        <TableHead>Batch #</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Received</TableHead>
                                        <TableHead className="text-right">Remaining</TableHead>
                                        <TableHead className="text-right">Cost</TableHead>
                                        <TableHead className="text-right">Sell Price</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.batches.map(batch => (
                                        <TableRow key={batch.id}>
                                            <TableCell className="font-mono text-xs">{batch.batch_number}</TableCell>
                                            <TableCell className="text-sm text-gray-600">
                                                {new Date(batch.purchase_date).toLocaleDateString('en-PK')}
                                            </TableCell>
                                            <TableCell className="text-right">{fmt(batch.quantity_received)}</TableCell>
                                            <TableCell className="text-right font-semibold">
                                                <span className={batch.quantity_remaining === 0 ? 'text-gray-400' : ''}>
                                                    {fmt(batch.quantity_remaining)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">Rs {fmt(batch.unit_cost)}</TableCell>
                                            <TableCell className="text-right">Rs {fmt(batch.selling_price)}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[batch.status] || ''}`}>
                                                    {batch.status}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {data.active_batches > 1 && (
                            <div className="mt-3 text-sm text-amber-600 bg-amber-50 rounded p-2">
                                This product has {data.active_batches} active batches. Sales will deduct from the oldest batch first (FIFO).
                                <Button
                                    size="sm"
                                    variant="link"
                                    className="text-indigo-600 p-0 ml-2 h-auto"
                                    onClick={() => { onClose(); router.push('/stock-audit'); }}
                                >
                                    Merge batches →
                                </Button>
                            </div>
                        )}
                    </>
                )}

                {!loading && !data && (
                    <div className="text-center py-8 text-gray-400">No batch data found.</div>
                )}
            </DialogContent>
        </Dialog>
    );
}
