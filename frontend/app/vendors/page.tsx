'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { ToWords } from 'to-words';
import { Button } from "@/components/ui/button";
import { Plus, Phone, Mail, MapPin, Download, ShoppingCart } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface Vendor {
    id: number;
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
}

import { useRouter } from 'next/navigation';

export default function VendorsPage() {
    const router = useRouter();

    // Number to words converter for prices
    const toWords = useMemo(
        () =>
            new ToWords({
                localeCode: 'en-IN',
                converterOptions: {
                    currency: true,
                    ignoreDecimal: false,
                    ignoreZeroCurrency: false,
                    doNotAddOnly: false,
                    currencyOptions: {
                        name: 'Rupee',
                        plural: 'Rupees',
                        symbol: 'Rs',
                        fractionalUnit: {
                            name: 'Paisa',
                            plural: 'Paise',
                            symbol: 'P',
                        },
                    },
                },
            }),
        []
    );

    const convertToWords = useCallback((value: number): string => {
        if (!Number.isFinite(value) || value < 0) return '';
        try {
            return toWords.convert(value);
        } catch {
            return '';
        }
    }, [toWords]);

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(100);
    const [totalCount, setTotalCount] = useState(0);
    const fetchRequestIdRef = useRef(0);

    // Form State
    const [name, setName] = useState('');
    const [contactName, setContactName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [openingBalance, setOpeningBalance] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchVendors();
        }, 300);

        return () => clearTimeout(timer);
    }, [search, page]);

    useEffect(() => {
        setPage(1);
    }, [search]);

    const fetchVendors = async () => {
        const requestId = ++fetchRequestIdRef.current;
        try {
            setLoading(true);
            const [{ data: vendorsData }, { data: countData }] = await Promise.all([
                api.get('/vendors/', {
                    params: {
                        search: search || undefined,
                        skip: (page - 1) * pageSize,
                        limit: pageSize,
                    }
                }),
                api.get('/vendors/count', {
                    params: { search: search || undefined }
                })
            ]);
            if (requestId !== fetchRequestIdRef.current) {
                return;
            }
            setVendors(vendorsData);
            setTotalCount(countData?.total || 0);
        } catch (error) {
            console.error("Failed to fetch vendors", error);
        } finally {
            if (requestId === fetchRequestIdRef.current) {
                setLoading(false);
            }
        }
    };

    const handleCreateVendor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (openingBalance < 0) {
            alert("Opening balance must be greater than or equal to 0");
            return;
        }
        try {
            await api.post('/vendors/', {
                name,
                contact_name: contactName || null,
                email: email || null,
                phone: phone || null,
                address: address || null,
                opening_balance: openingBalance
            });
            setOpen(false);
            resetForm();
            fetchVendors();
        } catch (error) {
            console.error("Failed to create vendor", error);
            alert("Failed to create vendor.");
        }
    };

    const handleBulkImport = async () => {
        if (!bulkFile) {
            alert("Please select a CSV file");
            return;
        }

        const formData = new FormData();
        formData.append('file', bulkFile);

        setBulkUploading(true);
        try {
            const { data } = await api.post('/vendors/bulk-import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setBulkResult(data);
            fetchVendors();
        } catch (error: any) {
            console.error("Failed to import vendors", error);
            alert(error?.response?.data?.detail || "Failed to import vendors");
        } finally {
            setBulkUploading(false);
        }
    };

    const handleDownloadCsv = async () => {
        try {
            const response = await api.get('/vendors/export-csv', {
                responseType: 'blob',
            });
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'vendors.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error("Failed to download vendors CSV", error);
            alert(error?.response?.data?.detail || "Failed to download vendors CSV");
        }
    };

    const resetForm = () => {
        setName('');
        setContactName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setOpeningBalance(0);
    };

    return (
        <div className="h-full overflow-y-auto p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Vendors</h1>
                    <p className="text-gray-500 mt-1">Manage your suppliers and partners.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push('/inventory/purchase')}>
                        <ShoppingCart className="mr-2 h-4 w-4" /> New Purchase
                    </Button>
                    <Button variant="outline" onClick={() => router.push('/inventory/purchase?held=1')}>
                        <ShoppingCart className="mr-2 h-4 w-4" /> Held Purchases
                    </Button>
                    <Button variant="outline" onClick={handleDownloadCsv}>
                        <Download className="mr-2 h-4 w-4" /> Download CSV
                    </Button>
                    <Dialog open={bulkOpen} onOpenChange={(nextOpen) => {
                        setBulkOpen(nextOpen);
                        if (!nextOpen) {
                            setBulkFile(null);
                            setBulkResult(null);
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button variant="outline">
                                <Plus className="mr-2 h-4 w-4" /> Bulk Import (CSV)
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Bulk Import Vendors</DialogTitle>
                                <DialogDescription>
                                    Upload a CSV file with columns: name, contact_name, email, phone, address, opening_balance
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="vendors_csv">CSV File</Label>
                                    <Input
                                        id="vendors_csv"
                                        type="file"
                                        accept=".csv"
                                        onChange={e => setBulkFile(e.target.files?.[0] || null)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Opening balance must be rs &gt;= 0.
                                    </p>
                                </div>
                                {bulkResult && (
                                    <div className="rounded-md border p-3 text-sm">
                                        <div>Created: {bulkResult.created}</div>
                                        <div>Skipped: {bulkResult.skipped}</div>
                                        {bulkResult.errors.length > 0 && (
                                            <div className="mt-2 text-xs text-red-600 space-y-1 max-h-32 overflow-auto">
                                                {bulkResult.errors.map((err, idx) => (
                                                    <div key={idx}>{err}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkUploading}>
                                    Close
                                </Button>
                                <Button onClick={handleBulkImport} disabled={bulkUploading || !bulkFile}>
                                    {bulkUploading ? "Importing..." : "Import Vendors"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                                <Plus className="mr-2 h-4 w-4" /> Add Vendor
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Add New Vendor</DialogTitle>
                            <DialogDescription>
                                Enter the details of your new supplier.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateVendor} className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Company Name</Label>
                                <Input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Sysco" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="contact">Contact Person</Label>
                                <Input id="contact" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="e.g. John Doe" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vendor@example.com" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 234 567 890" />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="address">Address</Label>
                                <Input id="address" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Supply Ln, City" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="opening_balance">Opening Balance (Legacy Payable)</Label>
                                <Input
                                    id="opening_balance"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={openingBalance}
                                    onChange={e => setOpeningBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Enter existing amount owed from manual system
                                </p>
                                {openingBalance > 0 && (
                                    <p className="text-xs text-blue-600 font-medium">
                                        {convertToWords(openingBalance)}
                                    </p>
                                )}
                            </div>
                            <DialogFooter>
                                <Button type="submit">Save Vendor</Button>
                            </DialogFooter>
                        </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="bg-white rounded-lg border shadow-sm p-4">
                <Input
                    placeholder="Search vendors by name, contact, email, or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {vendors.map((vendor) => (
                    <Card key={vendor.id} onClick={() => router.push(`/vendors/${vendor.id}`)} className="hover:shadow-md transition-shadow group cursor-pointer border-l-4 border-l-transparent hover:border-l-indigo-500">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center justify-between">
                                {vendor.name}
                            </CardTitle>
                            <CardDescription className="text-sm">
                                {vendor.contact_name || 'No Contact Person'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-indigo-500" />
                                <span>{vendor.email || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-indigo-500" />
                                <span>{vendor.phone || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-indigo-500" />
                                <span className="truncate">{vendor.address || 'N/A'}</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {vendors.length === 0 && !loading && (
                    <div className="col-span-full text-center py-12 bg-gray-50 rounded-lg border border-dashed">
                        <p className="text-gray-500">No vendors found. Add your first supplier to get started.</p>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                    {totalCount === 0
                        ? "Showing 0 of 0"
                        : `Showing ${(page - 1) * pageSize + 1}-${(page - 1) * pageSize + vendors.length} of ${totalCount}`}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1 || loading}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page * pageSize >= totalCount || loading}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
