'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Plus, Phone, Mail, MapPin } from "lucide-react";
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
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [contactName, setContactName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');

    useEffect(() => {
        fetchVendors();
    }, []);

    const fetchVendors = async () => {
        try {
            const { data } = await api.get('/vendors/');
            setVendors(data);
        } catch (error) {
            console.error("Failed to fetch vendors", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateVendor = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/vendors/', {
                name,
                contact_name: contactName || null,
                email: email || null,
                phone: phone || null,
                address: address || null
            });
            setOpen(false);
            resetForm();
            fetchVendors();
        } catch (error) {
            console.error("Failed to create vendor", error);
            alert("Failed to create vendor.");
        }
    };

    const resetForm = () => {
        setName('');
        setContactName('');
        setEmail('');
        setPhone('');
        setAddress('');
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Vendors</h1>
                    <p className="text-gray-500 mt-1">Manage your suppliers and partners.</p>
                </div>
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
                            <DialogFooter>
                                <Button type="submit">Save Vendor</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
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
        </div>
    );
}
