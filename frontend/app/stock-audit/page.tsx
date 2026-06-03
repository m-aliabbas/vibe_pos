'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import {
    stockAuditApi,
    StockBatch,
    BatchSummaryByProduct,
    InventorySummary,
    CostingComparison,
    MergeRequest,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Layers, PackageCheck, TrendingUp, Boxes, RefreshCw, GitMerge, AlertTriangle } from 'lucide-react';

type Tab = 'batches' | 'costing';

const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    depleted: 'bg-gray-100 text-gray-600',
    merged: 'bg-blue-100 text-blue-700',
};

function fmt(n: number) {
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StockAuditPage() {
    const router = useRouter();
    const { user } = useAuthStore();

    const [tab, setTab] = useState<Tab>('batches');
    const [batches, setBatches] = useState<StockBatch[]>([]);
    const [summary, setSummary] = useState<InventorySummary | null>(null);
    const [costing, setCosting] = useState<CostingComparison[]>([]);
    const [loading, setLoading] = useState(true);

    const [statusFilter, setStatusFilter] = useState('active');
    const [searchTerm, setSearchTerm] = useState('');

    // Merge state
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [mergeOpen, setMergeOpen] = useState(false);
    const [mergeMethod, setMergeMethod] = useState<'weighted_avg' | 'use_latest' | 'use_lowest'>('weighted_avg');
    const [mergeSellingPrice, setMergeSellingPrice] = useState('');
    const [mergeNotes, setMergeNotes] = useState('');
    const [merging, setMerging] = useState(false);

    // Edit batch selling price
    const [editBatch, setEditBatch] = useState<StockBatch | null>(null);
    const [editPrice, setEditPrice] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editSaving, setEditSaving] = useState(false);

    // Costing date filter
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [batchList, summaryData] = await Promise.all([
                stockAuditApi.listBatches({ status: statusFilter === 'all' ? undefined : statusFilter, limit: 500 }),
                stockAuditApi.getSummary(),
            ]);
            setBatches(batchList);
            setSummary(summaryData);
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const loadCosting = useCallback(async () => {
        try {
            const data = await stockAuditApi.getCostingComparison({
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
            });
            setCosting(data);
        } catch {
            // silent
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        if (!user) { router.push('/'); return; }
        loadData();
    }, [user, router, loadData]);

    useEffect(() => {
        if (tab === 'costing') loadCosting();
    }, [tab, loadCosting]);

    const filtered = batches.filter(b =>
        !searchTerm || b.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) || b.batch_number.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const openMerge = () => {
        if (selectedIds.size < 2) return;
        const sel = batches.filter(b => selectedIds.has(b.id));
        const productIds = new Set(sel.map(b => b.product_id));
        if (productIds.size > 1) {
            alert('All selected batches must belong to the same product.');
            return;
        }
        const maxSp = Math.max(...sel.map(b => b.selling_price));
        setMergeSellingPrice(String(maxSp));
        setMergeNotes('');
        setMergeMethod('weighted_avg');
        setMergeOpen(true);
    };

    const handleMerge = async () => {
        setMerging(true);
        try {
            await stockAuditApi.mergeBatches({
                batch_ids: [...selectedIds],
                merge_method: mergeMethod,
                new_selling_price: mergeSellingPrice ? parseFloat(mergeSellingPrice) : undefined,
                notes: mergeNotes || undefined,
            });
            setMergeOpen(false);
            setSelectedIds(new Set());
            loadData();
        } catch {
            alert('Merge failed. Check console for details.');
        } finally {
            setMerging(false);
        }
    };

    const openEdit = (batch: StockBatch) => {
        setEditBatch(batch);
        setEditPrice(String(batch.selling_price));
        setEditNotes(batch.notes || '');
    };

    const handleEditSave = async () => {
        if (!editBatch) return;
        setEditSaving(true);
        try {
            await stockAuditApi.updateBatch(editBatch.id, {
                selling_price: editPrice ? parseFloat(editPrice) : undefined,
                notes: editNotes || undefined,
            });
            setEditBatch(null);
            loadData();
        } catch {
            alert('Update failed.');
        } finally {
            setEditSaving(false);
        }
    };

    const selectedBatches = batches.filter(b => selectedIds.has(b.id));

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Layers className="w-6 h-6 text-indigo-600" />
                    <h1 className="text-2xl font-bold">Stock Audit</h1>
                </div>
                <Button variant="outline" size="sm" onClick={loadData}>
                    <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl border p-4">
                        <div className="text-sm text-gray-500 mb-1">Inventory Value</div>
                        <div className="text-xl font-bold text-indigo-700">Rs {fmt(summary.total_inventory_value)}</div>
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                        <div className="text-sm text-gray-500 mb-1">Active Batches</div>
                        <div className="text-xl font-bold text-green-700">{summary.total_active_batches}</div>
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                        <div className="text-sm text-gray-500 mb-1">Depleted Batches</div>
                        <div className="text-xl font-bold text-gray-600">{summary.total_depleted_batches}</div>
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                        <div className="text-sm text-gray-500 mb-1">Products w/ Multi-Batch</div>
                        <div className="text-xl font-bold text-amber-700">{summary.products_with_multiple_batches}</div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b">
                {([['batches', 'Batch Inventory'], ['costing', 'Costing Comparison']] as const).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'batches' && (
                <>
                    {/* Filters + Merge action */}
                    <div className="flex flex-wrap gap-3 mb-4 items-center">
                        <Input
                            placeholder="Search product or batch..."
                            className="w-64"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-36">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="depleted">Depleted</SelectItem>
                                <SelectItem value="merged">Merged</SelectItem>
                            </SelectContent>
                        </Select>
                        {selectedIds.size >= 2 && (
                            <Button size="sm" onClick={openMerge} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                <GitMerge className="w-4 h-4 mr-1" />
                                Merge {selectedIds.size} Batches
                            </Button>
                        )}
                        {selectedIds.size > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                                Clear Selection
                            </Button>
                        )}
                    </div>

                    {/* Batch Table */}
                    <div className="bg-white rounded-xl border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50">
                                    <TableHead className="w-8"></TableHead>
                                    <TableHead>Batch #</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Purchase Date</TableHead>
                                    <TableHead className="text-right">Received</TableHead>
                                    <TableHead className="text-right">Remaining</TableHead>
                                    <TableHead className="text-right">Cost</TableHead>
                                    <TableHead className="text-right">Selling Price</TableHead>
                                    <TableHead>Expiry</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={11} className="text-center py-12 text-gray-400">Loading...</TableCell>
                                    </TableRow>
                                ) : filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={11} className="text-center py-12 text-gray-400">No batches found</TableCell>
                                    </TableRow>
                                ) : filtered.map(batch => (
                                    <TableRow key={batch.id} className={selectedIds.has(batch.id) ? 'bg-indigo-50' : ''}>
                                        <TableCell>
                                            {batch.status === 'active' && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(batch.id)}
                                                    onChange={() => toggleSelect(batch.id)}
                                                    className="rounded"
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-gray-600">{batch.batch_number}</TableCell>
                                        <TableCell className="font-medium">{batch.product_name || `#${batch.product_id}`}</TableCell>
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
                                        <TableCell className="text-sm text-gray-500">
                                            {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString('en-PK') : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[batch.status] || ''}`}>
                                                {batch.status}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {batch.status === 'active' && (
                                                <Button size="sm" variant="ghost" className="text-xs" onClick={() => openEdit(batch)}>
                                                    Edit
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            {tab === 'costing' && (
                <>
                    <div className="flex gap-3 mb-4 items-end">
                        <div>
                            <Label className="text-sm text-gray-600 mb-1 block">From</Label>
                            <Input type="date" className="w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-sm text-gray-600 mb-1 block">To</Label>
                            <Input type="date" className="w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                        </div>
                        <Button onClick={loadCosting} size="sm">Apply</Button>
                    </div>
                    <div className="bg-white rounded-xl border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50">
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Units Sold</TableHead>
                                    <TableHead className="text-right">FIFO COGS</TableHead>
                                    <TableHead className="text-right">LIFO COGS</TableHead>
                                    <TableHead className="text-right">Weighted Avg COGS</TableHead>
                                    <TableHead className="text-right">FIFO vs WAC</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {costing.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                                            No data — apply date range or make some sales first
                                        </TableCell>
                                    </TableRow>
                                ) : costing.map(row => (
                                    <TableRow key={row.product_id}>
                                        <TableCell className="font-medium">{row.product_name}</TableCell>
                                        <TableCell className="text-right">{fmt(row.units_sold)}</TableCell>
                                        <TableCell className="text-right">Rs {fmt(row.fifo_cogs)}</TableCell>
                                        <TableCell className="text-right">Rs {fmt(row.lifo_cogs)}</TableCell>
                                        <TableCell className="text-right">Rs {fmt(row.wac_cogs)}</TableCell>
                                        <TableCell className="text-right">
                                            <span className={row.fifo_cogs < row.wac_cogs ? 'text-green-600' : row.fifo_cogs > row.wac_cogs ? 'text-red-600' : ''}>
                                                {row.fifo_cogs === row.wac_cogs ? '—' : `${row.fifo_cogs < row.wac_cogs ? '↓' : '↑'} Rs ${fmt(Math.abs(row.fifo_cogs - row.wac_cogs))}`}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            {/* Edit Batch Dialog */}
            <Dialog open={!!editBatch} onOpenChange={open => !open && setEditBatch(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Batch — {editBatch?.batch_number}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label>Selling Price</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={editPrice}
                                onChange={e => setEditPrice(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label>Notes</Label>
                            <Input
                                value={editNotes}
                                onChange={e => setEditNotes(e.target.value)}
                                placeholder="Optional note"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditBatch(null)}>Cancel</Button>
                        <Button onClick={handleEditSave} disabled={editSaving}>
                            {editSaving ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Merge Dialog */}
            <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Merge {selectedIds.size} Batches</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="text-sm text-gray-500 bg-gray-50 rounded p-3">
                            {selectedBatches.map(b => (
                                <div key={b.id} className="flex justify-between py-0.5">
                                    <span className="font-mono text-xs">{b.batch_number}</span>
                                    <span>Qty: {fmt(b.quantity_remaining)} @ Rs {fmt(b.unit_cost)}</span>
                                </div>
                            ))}
                        </div>
                        <div>
                            <Label>Merge Method (determines new cost)</Label>
                            <Select value={mergeMethod} onValueChange={v => setMergeMethod(v as typeof mergeMethod)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="weighted_avg">Weighted Average</SelectItem>
                                    <SelectItem value="use_latest">Use Latest Batch Cost</SelectItem>
                                    <SelectItem value="use_lowest">Use Lowest Cost</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>New Selling Price</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={mergeSellingPrice}
                                onChange={e => setMergeSellingPrice(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label>Notes</Label>
                            <Input
                                value={mergeNotes}
                                onChange={e => setMergeNotes(e.target.value)}
                                placeholder="Optional merge note"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
                        <Button onClick={handleMerge} disabled={merging} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {merging ? 'Merging...' : 'Confirm Merge'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
