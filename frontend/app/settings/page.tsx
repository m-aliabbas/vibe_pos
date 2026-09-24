"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
    Database,
    Download,
    Upload,
    AlertCircle,
    CheckCircle2,
    Loader2,
    HardDrive,
    Clock,
    Store,
    Save,
    MessageCircle,
    Wallet,
} from 'lucide-react';
import api, { WhatsAppReportSettings, whatsappReportSettingsApi, cashRegisterApi, CashRegisterSession } from '@/lib/api';
import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError(error)) {
        return error.response?.data?.detail || error.message || fallback;
    }
    return error instanceof Error ? error.message : fallback;
};

interface DatabaseFile {
    path: string;
    size: number;
    size_mb: number;
}

interface BackupFile {
    filename: string;
    size: number;
    size_mb: number;
    created: string;
}

interface StoreSettingsForm {
    store_name: string;
    store_address: string;
    store_city: string;
    store_phone: string;
    store_email: string;
    store_tax_id: string;
    store_website: string;
    cash_register_enabled: boolean;
}

const BackupRestorePage: React.FC = () => {
    const [dbFiles, setDbFiles] = useState<DatabaseFile[]>([]);
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Store settings state
    const [storeForm, setStoreForm] = useState<StoreSettingsForm>({
        store_name: '',
        store_address: '',
        store_city: '',
        store_phone: '',
        store_email: '',
        store_tax_id: '',
        store_website: '',
        cash_register_enabled: false,
    });
    const [storeLoading, setStoreLoading] = useState(false);
    const [openCashSessions, setOpenCashSessions] = useState<CashRegisterSession[]>([]);
    const [cashSessionsLoading, setCashSessionsLoading] = useState(false);
    const [storeMessage, setStoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [whatsAppForm, setWhatsAppForm] = useState<WhatsAppReportSettings>({
        owner_number: '',
        daily_report_enabled: false,
        daily_report_time: '09:00',
        last_daily_report_date: null,
    });
    const [whatsAppLoading, setWhatsAppLoading] = useState(false);
    const [whatsAppMessage, setWhatsAppMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fetchStoreSettings = async () => {
        try {
            const res = await api.get('/settings/store');
            const d = res.data;
            setStoreForm({
                store_name: d.store_name || '',
                store_address: d.store_address || '',
                store_city: d.store_city || '',
                store_phone: d.store_phone || '',
                store_email: d.store_email || '',
                store_tax_id: d.store_tax_id || '',
                store_website: d.store_website || '',
                cash_register_enabled: Boolean(d.cash_register_enabled),
            });
        } catch {
            // not critical
        }
    };

    const handleStoreSave = async () => {
        setStoreLoading(true);
        setStoreMessage(null);
        try {
            await api.put('/settings/store', storeForm);
            setStoreMessage({ type: 'success', text: 'Store information saved successfully!' });
        } catch (error: unknown) {
            setStoreMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save.') });
        } finally {
            setStoreLoading(false);
        }
    };

    const fetchWhatsAppReportSettings = async () => {
        try {
            const data = await whatsappReportSettingsApi.get();
            setWhatsAppForm({
                owner_number: data.owner_number || '',
                daily_report_enabled: Boolean(data.daily_report_enabled),
                daily_report_time: data.daily_report_time || '09:00',
                last_daily_report_date: data.last_daily_report_date || null,
            });
        } catch {
            // The main settings screen remains usable if WhatsApp is unavailable.
        }
    };

    const handleWhatsAppSave = async () => {
        setWhatsAppLoading(true);
        setWhatsAppMessage(null);
        try {
            const data = await whatsappReportSettingsApi.update({
                owner_number: whatsAppForm.owner_number,
                daily_report_enabled: whatsAppForm.daily_report_enabled,
                daily_report_time: whatsAppForm.daily_report_time,
            });
            setWhatsAppForm({
                owner_number: data.owner_number || '',
                daily_report_enabled: Boolean(data.daily_report_enabled),
                daily_report_time: data.daily_report_time || '09:00',
                last_daily_report_date: data.last_daily_report_date || null,
            });
            setWhatsAppMessage({ type: 'success', text: 'WhatsApp owner and report schedule saved.' });
        } catch (error: unknown) {
            setWhatsAppMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save WhatsApp settings.') });
        } finally {
            setWhatsAppLoading(false);
        }
    };

    const fetchDatabaseFiles = async () => {
        try {
            const response = await api.get('/backup/list-files');
            setDbFiles(response.data.files || []);
        } catch (error) {
            console.error('Failed to fetch database files:', error);
        }
    };

    const fetchBackups = async () => {
        try {
            const response = await api.get('/backup/list');
            setBackups(response.data.backups || []);
        } catch (error) {
            console.error('Failed to fetch backups:', error);
        }
    };

    useEffect(() => {
        fetchDatabaseFiles();
        fetchBackups();
        fetchStoreSettings();
        fetchWhatsAppReportSettings();
        fetchOpenCashSessions();
    }, []);

    const fetchOpenCashSessions = async () => {
        setCashSessionsLoading(true);
        try {
            const sessions = await cashRegisterApi.getOpenSessions();
            setOpenCashSessions(sessions);
        } catch {
            // Cash register endpoints may be unavailable on older backends.
        } finally {
            setCashSessionsLoading(false);
        }
    };

    const handleCreateBackup = async () => {
        try {
            setLoading(true);
            setMessage(null);

            // Open save dialog
            const savePath = await invoke<string | null>('save_backup_dialog');

            if (!savePath) {
                setLoading(false);
                return; // User cancelled
            }

            // Create backup on backend
            const response = await api.post('/backup/create');

            if (response.data.success) {
                // Download the backup file
                const downloadResponse = await api.get(
                    `/backup/download/${response.data.backup_filename}`,
                    { responseType: 'blob' }
                );

                // Save to user-selected location
                const blob = new Blob([downloadResponse.data], { type: 'application/zip' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = response.data.backup_filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                setMessage({
                    type: 'success',
                    text: `Backup created successfully! Saved to: ${savePath}`
                });

                fetchBackups();
            }
        } catch (error: unknown) {
            setMessage({
                type: 'error',
                text: `Backup failed: ${getErrorMessage(error, 'Unknown error')}`
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRestoreBackup = async () => {
        try {
            setLoading(true);
            setMessage(null);

            // Open file dialog
            const backupPath = await invoke<string | null>('open_backup_dialog');

            if (!backupPath) {
                setLoading(false);
                return; // User cancelled
            }

            // Confirm restoration
            const confirmed = window.confirm(
                'Are you sure you want to restore from this backup?\n\n' +
                'This will replace all current database files and the application will need to be restarted.\n\n' +
                'Click OK to continue.'
            );

            if (!confirmed) {
                setLoading(false);
                return;
            }

            // Read the file
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.zip';

            fileInput.onchange = async (event: Event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await api.post('/backup/restore', formData, {
                        headers: {
                            'Content-Type': 'multipart/form-data',
                        },
                    });

                    if (response.data.success) {
                        setMessage({
                            type: 'success',
                            text: 'Backup restored successfully! Please restart the application for changes to take effect.'
                        });
                    }
                } catch (error: unknown) {
                    setMessage({
                        type: 'error',
                        text: `Restore failed: ${getErrorMessage(error, 'Unknown error')}`
                    });
                } finally {
                    setLoading(false);
                }
            };

            fileInput.click();
        } catch (error: unknown) {
            setMessage({
                type: 'error',
                text: `Restore failed: ${getErrorMessage(error, 'Unknown error')}`
            });
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    return (
        <AdminRouteGuard>
            <AdminLayout>
                <div className="space-y-6">
                    {/* Header */}
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
                        <p className="text-gray-600 mt-1">Manage store information, WhatsApp reports, and database backups</p>
                    </div>

                    {/* Store Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Store className="h-5 w-5" />
                                Store Information
                            </CardTitle>
                            <CardDescription>
                                This information appears on all receipts, invoices, and WhatsApp messages
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {storeMessage && (
                                <Alert variant={storeMessage.type === 'error' ? 'destructive' : 'default'}>
                                    {storeMessage.type === 'success' ? (
                                        <CheckCircle2 className="h-4 w-4" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4" />
                                    )}
                                    <AlertDescription>{storeMessage.text}</AlertDescription>
                                </Alert>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="store_name">Store Name *</Label>
                                    <Input
                                        id="store_name"
                                        placeholder="e.g. Malik D Store"
                                        value={storeForm.store_name}
                                        onChange={e => setStoreForm(f => ({ ...f, store_name: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="store_phone">Phone Number</Label>
                                    <Input
                                        id="store_phone"
                                        placeholder="e.g. 0311-1234567"
                                        value={storeForm.store_phone}
                                        onChange={e => setStoreForm(f => ({ ...f, store_phone: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                    <Label htmlFor="store_address">Address</Label>
                                    <Input
                                        id="store_address"
                                        placeholder="e.g. Shop #12, Main Bazar"
                                        value={storeForm.store_address}
                                        onChange={e => setStoreForm(f => ({ ...f, store_address: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="store_city">City</Label>
                                    <Input
                                        id="store_city"
                                        placeholder="e.g. Islamabad"
                                        value={storeForm.store_city}
                                        onChange={e => setStoreForm(f => ({ ...f, store_city: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="store_email">Email</Label>
                                    <Input
                                        id="store_email"
                                        type="email"
                                        placeholder="e.g. store@example.com"
                                        value={storeForm.store_email}
                                        onChange={e => setStoreForm(f => ({ ...f, store_email: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="store_tax_id">Tax ID / NTN</Label>
                                    <Input
                                        id="store_tax_id"
                                        placeholder="e.g. 1234567-8"
                                        value={storeForm.store_tax_id}
                                        onChange={e => setStoreForm(f => ({ ...f, store_tax_id: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="store_website">Website</Label>
                                    <Input
                                        id="store_website"
                                        placeholder="e.g. mystore.com"
                                        value={storeForm.store_website}
                                        onChange={e => setStoreForm(f => ({ ...f, store_website: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="flex items-start gap-3 rounded-md border p-3">
                                <Checkbox
                                    id="cash_register_enabled"
                                    checked={storeForm.cash_register_enabled}
                                    onCheckedChange={checked => setStoreForm(f => ({ ...f, cash_register_enabled: checked === true }))}
                                />
                                <div className="space-y-1">
                                    <Label htmlFor="cash_register_enabled">Enable cash drawer tracking</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Users must declare opening cash after login and closing cash before ending their shift.
                                        A summary comparing expected vs. counted cash is generated automatically.
                                    </p>
                                </div>
                            </div>
                            <Button onClick={handleStoreSave} disabled={storeLoading} className="mt-2">
                                {storeLoading ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                                ) : (
                                    <><Save className="h-4 w-4 mr-2" />Save Store Info</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MessageCircle className="h-5 w-5" />
                                WhatsApp Owner Reports
                            </CardTitle>
                            <CardDescription>
                                Only this number can request private reports. Use the international format, for example 923001234567.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {whatsAppMessage && (
                                <Alert variant={whatsAppMessage.type === 'error' ? 'destructive' : 'default'}>
                                    {whatsAppMessage.type === 'success' ? (
                                        <CheckCircle2 className="h-4 w-4" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4" />
                                    )}
                                    <AlertDescription>{whatsAppMessage.text}</AlertDescription>
                                </Alert>
                            )}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-1">
                                    <Label htmlFor="whatsapp_owner_number">Owner WhatsApp Number</Label>
                                    <Input
                                        id="whatsapp_owner_number"
                                        inputMode="tel"
                                        placeholder="e.g. 923001234567"
                                        value={whatsAppForm.owner_number}
                                        onChange={event => setWhatsAppForm(form => ({ ...form, owner_number: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="whatsapp_daily_report_time">Daily Send Time (Pakistan time)</Label>
                                    <Input
                                        id="whatsapp_daily_report_time"
                                        type="time"
                                        value={whatsAppForm.daily_report_time}
                                        onChange={event => setWhatsAppForm(form => ({ ...form, daily_report_time: event.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="flex items-start gap-3 rounded-md border p-3">
                                <Checkbox
                                    id="whatsapp_daily_report_enabled"
                                    checked={whatsAppForm.daily_report_enabled}
                                    onCheckedChange={checked => setWhatsAppForm(form => ({ ...form, daily_report_enabled: checked === true }))}
                                />
                                <div className="space-y-1">
                                    <Label htmlFor="whatsapp_daily_report_enabled">Send automatic previous-day PDF</Label>
                                    <p className="text-sm text-muted-foreground">
                                        If the system was off, the next PDF includes all completed days not yet delivered.
                                    </p>
                                </div>
                            </div>
                            {whatsAppForm.last_daily_report_date && (
                                <p className="text-sm text-muted-foreground">
                                    Last automatic report delivered through {whatsAppForm.last_daily_report_date}.
                                </p>
                            )}
                            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                                <p className="font-medium">Owner commands</p>
                                <p className="mt-1 font-mono text-xs leading-5">
                                    /previous-day-report<br />
                                    /previous-week-report<br />
                                    /low-stock-item<br />
                                    /balance &lt;customer phone&gt;<br />
                                    /VendorOutstanding<br />
                                    /help
                                </p>
                            </div>
                            <Button onClick={handleWhatsAppSave} disabled={whatsAppLoading}>
                                {whatsAppLoading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                                ) : (
                                    <><Save className="mr-2 h-4 w-4" />Save WhatsApp Settings</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Wallet className="h-5 w-5" />
                                Open Cash Drawers
                            </CardTitle>
                            <CardDescription>
                                See which users currently have an open cash drawer session and how much cash they started with.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-end">
                                <Button variant="outline" size="sm" onClick={fetchOpenCashSessions} disabled={cashSessionsLoading}>
                                    {cashSessionsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Refresh
                                </Button>
                            </div>
                            {openCashSessions.length === 0 ? (
                                <p className="text-sm text-gray-500">No cash drawers are currently open.</p>
                            ) : (
                                <div className="space-y-2">
                                    {openCashSessions.map(session => (
                                        <div key={session.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                                            <div>
                                                <p className="font-medium">{session.username}</p>
                                                <p className="text-xs text-gray-500">
                                                    Opened {new Date(session.opened_at).toLocaleString()}
                                                </p>
                                            </div>
                                            <Badge variant="secondary">Rs {session.opening_cash.toFixed(2)}</Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Backup Header */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Backup &amp; Restore</h2>
                        <p className="text-gray-600 mt-1">Manage your database backups</p>
                    </div>

                    {/* Message Alert */}
                    {message && (
                        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
                            {message.type === 'success' ? (
                                <CheckCircle2 className="h-4 w-4" />
                            ) : (
                                <AlertCircle className="h-4 w-4" />
                            )}
                            <AlertDescription>{message.text}</AlertDescription>
                        </Alert>
                    )}

                    {/* Database Files Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5" />
                                Database Files
                            </CardTitle>
                            <CardDescription>
                                These files will be included in your backup
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {dbFiles.length === 0 ? (
                                <p className="text-gray-500 text-sm">No database files found</p>
                            ) : (
                                <div className="space-y-2">
                                    {dbFiles.map((file, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <HardDrive className="h-4 w-4 text-gray-500" />
                                                <span className="font-mono text-sm">{file.path}</span>
                                            </div>
                                            <Badge variant="secondary">{file.size_mb} MB</Badge>
                                        </div>
                                    ))}
                                    <div className="pt-2 border-t mt-4">
                                        <p className="text-sm text-gray-600">
                                            Total: <strong>{dbFiles.length}</strong> files •{' '}
                                            <strong>
                                                {dbFiles.reduce((sum, f) => sum + f.size_mb, 0).toFixed(2)} MB
                                            </strong>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Backup Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Create Backup */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Download className="h-5 w-5" />
                                    Create Backup
                                </CardTitle>
                                <CardDescription>
                                    Export all database files to a ZIP archive
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-gray-600">
                                    This will create a timestamped backup of all your database files.
                                    You can save it anywhere on your computer for safekeeping.
                                </p>
                                <Button
                                    onClick={handleCreateBackup}
                                    disabled={loading || dbFiles.length === 0}
                                    className="w-full"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Creating Backup...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="h-4 w-4 mr-2" />
                                            Create Backup
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Restore Backup */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Upload className="h-5 w-5" />
                                    Restore Backup
                                </CardTitle>
                                <CardDescription>
                                    Restore database files from a backup archive
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Alert>
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        <strong>Warning:</strong> Restoring will replace all current database files.
                                        Make sure to create a backup first!
                                    </AlertDescription>
                                </Alert>
                                <Button
                                    onClick={handleRestoreBackup}
                                    disabled={loading}
                                    variant="outline"
                                    className="w-full"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Restoring...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4 mr-2" />
                                            Restore from Backup
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Recent Backups */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                Recent Backups
                            </CardTitle>
                            <CardDescription>
                                Backups stored in the application data directory
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {backups.length === 0 ? (
                                <p className="text-gray-500 text-sm">No backups found</p>
                            ) : (
                                <div className="space-y-2">
                                    {backups.slice(0, 10).map((backup, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Database className="h-4 w-4 text-gray-500" />
                                                <div>
                                                    <p className="font-mono text-sm">{backup.filename}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {formatDate(backup.created)}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge variant="secondary">{backup.size_mb} MB</Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </AdminLayout>
        </AdminRouteGuard>
    );
};

export default BackupRestorePage;
