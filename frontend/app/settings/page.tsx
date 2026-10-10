"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
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
    CalendarClock,
    CheckCircle2,
    Loader2,
    HardDrive,
    Clock,
    Store,
    Save,
    MessageCircle,
    Wallet,
    FileText,
    ImagePlus,
    Trash2,
    CloudUpload,
    CloudDownload,
    LogIn,
    LogOut,
    UserRound,
} from 'lucide-react';
import api, { backupApi, WhatsAppReportSettings, whatsappReportSettingsApi, cashRegisterApi, CashRegisterSession, GoogleDriveBackupFile, GoogleDriveBackupStatus, googleDriveBackupApi, InvoiceDesign, InvoiceFormat, LicenseStatus, LocalBackupFile, PosDatabaseFile, storeSettingsApi } from '@/lib/api';
import axios from 'axios';

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError(error)) {
        return error.response?.data?.detail || error.message || fallback;
    }
    return error instanceof Error ? error.message : fallback;
};

interface StoreSettingsForm {
    store_name: string;
    store_address: string;
    store_city: string;
    store_phone: string;
    store_email: string;
    store_tax_id: string;
    store_website: string;
    cash_register_enabled: boolean;
    default_print_format: InvoiceFormat;
    default_whatsapp_format: InvoiceFormat;
    default_print_design: InvoiceDesign;
    default_whatsapp_design: InvoiceDesign;
    invoice_show_tax_id: boolean;
    invoice_show_cashier: boolean;
    invoice_show_sku: boolean;
    invoice_show_customer_balance: boolean;
    invoice_footer_message: string;
    invoice_terms: string;
}

const invoiceFormats: Array<{ id: InvoiceFormat; title: string; description: string }> = [
    { id: 'compact', title: 'Compact Receipt', description: 'Optimized for 80 mm thermal printers.' },
    { id: 'professional', title: 'Professional Invoice', description: 'A4 document for formal billing and PDF sharing.' },
    { id: 'mobile', title: 'Mobile Invoice', description: 'Easy-to-read layout for WhatsApp and phones.' },
];

const invoiceDesigns: Array<{ id: InvoiceDesign; title: string; description: string }> = [
    { id: 'classic', title: 'Ledger', description: 'Refined monochrome typography for traditional retail billing.' },
    { id: 'modern', title: 'Commerce', description: 'Brand-forward header, metadata cards, and clear payment states.' },
    { id: 'minimal', title: 'Essential', description: 'Spacious hierarchy, subtle dividers, and low-ink printing.' },
];

const BackupRestorePage: React.FC = () => {
    const [dbFiles, setDbFiles] = useState<PosDatabaseFile[]>([]);
    const [backups, setBackups] = useState<LocalBackupFile[]>([]);
    const [backupLoading, setBackupLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [restoreStatus, setRestoreStatus] = useState('');
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
        default_print_format: 'compact',
        default_whatsapp_format: 'mobile',
        default_print_design: 'classic',
        default_whatsapp_design: 'modern',
        invoice_show_tax_id: true,
        invoice_show_cashier: true,
        invoice_show_sku: false,
        invoice_show_customer_balance: true,
        invoice_footer_message: 'Thank you for your business!',
        invoice_terms: 'Return and exchange accepted with invoice.',
    });
    const [storeLoading, setStoreLoading] = useState(false);
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
    const [openCashSessions, setOpenCashSessions] = useState<CashRegisterSession[]>([]);
    const [cashSessionsLoading, setCashSessionsLoading] = useState(false);
    const [storeMessage, setStoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [logoLoading, setLogoLoading] = useState(false);
    const [whatsAppForm, setWhatsAppForm] = useState<WhatsAppReportSettings>({
        owner_number: '',
        daily_report_enabled: false,
        daily_report_time: '09:00',
        last_daily_report_date: null,
    });
    const [whatsAppLoading, setWhatsAppLoading] = useState(false);
    const [whatsAppMessage, setWhatsAppMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [driveStatus, setDriveStatus] = useState<GoogleDriveBackupStatus | null>(null);
    const [driveBackups, setDriveBackups] = useState<GoogleDriveBackupFile[]>([]);
    const [driveLoading, setDriveLoading] = useState<'connect' | 'disconnect' | 'upload' | null>(null);
    const [driveMessage, setDriveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
                default_print_format: d.default_print_format || 'compact',
                default_whatsapp_format: d.default_whatsapp_format || 'mobile',
                default_print_design: d.default_print_design || 'classic',
                default_whatsapp_design: d.default_whatsapp_design || 'modern',
                invoice_show_tax_id: d.invoice_show_tax_id !== false,
                invoice_show_cashier: d.invoice_show_cashier !== false,
                invoice_show_sku: Boolean(d.invoice_show_sku),
                invoice_show_customer_balance: d.invoice_show_customer_balance !== false,
                invoice_footer_message: d.invoice_footer_message || '',
                invoice_terms: d.invoice_terms ?? '',
            });
            setLogoUrl(d.logo_url ? `/api/v1${d.logo_url}?v=${Date.now()}` : null);
        } catch {
            // not critical
        }
    };

    const fetchLicenseStatus = async () => {
        try {
            setLicenseStatus(await storeSettingsApi.getLicenseStatus());
        } catch {
            // License status must not prevent the rest of Settings from loading.
        }
    };

    const handleLogoUpload = async (file?: File) => {
        if (!file) return;
        setLogoLoading(true);
        setStoreMessage(null);
        try {
            const updated = await storeSettingsApi.uploadLogo(file);
            setLogoUrl(updated.logo_url ? `/api/v1${updated.logo_url}?v=${Date.now()}` : null);
            setStoreMessage({ type: 'success', text: 'Business logo uploaded successfully.' });
        } catch (error: unknown) {
            setStoreMessage({ type: 'error', text: getErrorMessage(error, 'Failed to upload logo.') });
        } finally {
            setLogoLoading(false);
        }
    };

    const handleLogoDelete = async () => {
        setLogoLoading(true);
        setStoreMessage(null);
        try {
            await storeSettingsApi.deleteLogo();
            setLogoUrl(null);
            setStoreMessage({ type: 'success', text: 'Business logo removed.' });
        } catch (error: unknown) {
            setStoreMessage({ type: 'error', text: getErrorMessage(error, 'Failed to remove logo.') });
        } finally {
            setLogoLoading(false);
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
            setDbFiles(await backupApi.listDatabaseFiles());
        } catch (error) {
            console.error('Failed to fetch database files:', error);
        }
    };

    const fetchBackups = async () => {
        try {
            setBackups(await backupApi.listLocal());
        } catch (error) {
            console.error('Failed to fetch backups:', error);
        }
    };

    const fetchGoogleDriveStatus = async () => {
        try {
            const status = await googleDriveBackupApi.getStatus();
            setDriveStatus(status);
            if (status.connected) {
                setDriveBackups(await googleDriveBackupApi.list());
            } else {
                setDriveBackups([]);
            }
        } catch (error: unknown) {
            setDriveMessage({
                type: 'error',
                text: getErrorMessage(error, 'Could not load Google Drive backup status.'),
            });
        }
    };

    useEffect(() => {
        fetchDatabaseFiles();
        fetchBackups();
        fetchStoreSettings();
        fetchLicenseStatus();
        fetchWhatsAppReportSettings();
        fetchOpenCashSessions();
        fetchGoogleDriveStatus();
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
        let backupCreated = false;

        try {
            setBackupLoading(true);
            setMessage(null);

            const result = await backupApi.create();

            if (result.success) {
                backupCreated = true;
                const filename = result.backup_filename;
                const downloadedBackup = await backupApi.download(filename);

                const blob = new Blob([downloadedBackup], { type: 'application/vnd.sqlite3' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);

                setMessage({
                    type: 'success',
                    text: result.drive_uploaded
                        ? `${filename} was saved to Google Drive and downloaded locally.`
                        : `${filename} was downloaded locally. ${result.drive_error || 'Google Drive is not connected.'}`
                });
                if (result.drive_uploaded) {
                    void fetchGoogleDriveStatus();
                }
            }
        } catch (error: unknown) {
            setMessage({
                type: 'error',
                text: backupCreated
                    ? `Backup was created on this POS, but the download failed: ${getErrorMessage(error, 'Unknown error')}`
                    : `Backup failed: ${getErrorMessage(error, 'Unknown error')}`
            });
        } finally {
            if (backupCreated) {
                fetchBackups();
            }
            setBackupLoading(false);
        }
    };

    const handleGoogleDriveConnect = async () => {
        setDriveLoading('connect');
        setDriveMessage(null);
        try {
            const status = await googleDriveBackupApi.connect();
            setDriveStatus(status);
            setDriveBackups(await googleDriveBackupApi.list());
            const account = status.account?.email || status.account?.display_name || 'Google account';
            setDriveMessage({ type: 'success', text: `Connected ${account} successfully.` });
        } catch (error: unknown) {
            setDriveMessage({
                type: 'error',
                text: getErrorMessage(error, 'Google Drive sign-in did not complete.'),
            });
        } finally {
            setDriveLoading(null);
        }
    };

    const handleGoogleDriveDisconnect = async () => {
        if (!window.confirm('Disconnect this Google account from VibePOS backups?')) return;

        setDriveLoading('disconnect');
        setDriveMessage(null);
        try {
            const status = await googleDriveBackupApi.disconnect();
            setDriveStatus(status);
            setDriveBackups([]);
            setDriveMessage({ type: 'success', text: 'Google Drive account disconnected.' });
        } catch (error: unknown) {
            setDriveMessage({
                type: 'error',
                text: getErrorMessage(error, 'Could not disconnect Google Drive.'),
            });
        } finally {
            setDriveLoading(null);
        }
    };

    const handleGoogleDriveUpload = async () => {
        setDriveLoading('upload');
        setDriveMessage(null);
        try {
            const result = await googleDriveBackupApi.upload();
            setDriveMessage({
                type: 'success',
                text: `${result.filename} uploaded to ${result.folder_name}.`,
            });
            setDriveBackups(await googleDriveBackupApi.list());
            fetchBackups();
        } catch (error: unknown) {
            setDriveMessage({
                type: 'error',
                text: getErrorMessage(error, 'Could not upload the backup to Google Drive.'),
            });
        } finally {
            setDriveLoading(null);
        }
    };

    const handleGoogleDriveRestore = async (backup: GoogleDriveBackupFile) => {
        const confirmed = window.confirm(
            `Restore ${backup.filename} from Google Drive?\n\n` +
            'This will replace the current pos.db. A local safety backup will be created first, then VibePOS must be restarted.'
        );
        if (!confirmed) return;

        setRestoreLoading(true);
        setRestoreStatus('Downloading from Google Drive...');
        setMessage(null);
        try {
            const result = await googleDriveBackupApi.restore(backup.file_id);
            setMessage({
                type: 'success',
                text: `${result.source_filename} restored successfully. Safety copy: ${result.safety_backup}. Restart VibePOS before continuing.`,
            });
            fetchBackups();
        } catch (error: unknown) {
            setMessage({
                type: 'error',
                text: `Drive restore failed: ${getErrorMessage(error, 'Unknown error')}`,
            });
        } finally {
            setRestoreLoading(false);
            setRestoreStatus('');
        }
    };

    const handleRestoreBackup = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.db,application/vnd.sqlite3,application/x-sqlite3';

        fileInput.onchange = async (event: Event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const confirmed = window.confirm(
                'Are you sure you want to restore from this backup?\n\n' +
                'This will replace the current pos.db. A local safety backup will be created first, then VibePOS must be restarted.\n\n' +
                'Click OK to continue.'
            );

            if (!confirmed) return;

            setRestoreLoading(true);
            setRestoreStatus('Uploading backup...');
            setMessage(null);
            try {
                const result = await backupApi.restoreLocal(
                    file,
                    (progressEvent) => {
                        if (progressEvent.total) {
                            const percent = Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100));
                            setRestoreStatus(percent < 100 ? `Uploading backup... ${percent}%` : 'Applying backup...');
                        }
                    }
                );

                if (result.success) {
                    setMessage({
                        type: 'success',
                        text: `pos.db restored successfully. Safety backup: ${result.safety_backup}. Restart VibePOS before continuing.`
                    });
                }
            } catch (error: unknown) {
                const timedOut = axios.isAxiosError(error) && error.code === 'ECONNABORTED';
                setMessage({
                    type: 'error',
                    text: timedOut
                        ? 'The POS did not confirm the restore within 60 seconds. Restart the application and verify the data before trying again.'
                        : `Restore failed: ${getErrorMessage(error, 'Unknown error')}`
                });
            } finally {
                setRestoreLoading(false);
                setRestoreStatus('');
            }
        };

        fileInput.click();
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
                        <p className="text-gray-600 mt-1">Manage store information, WhatsApp reports, and local or Google Drive backups</p>
                    </div>

                    {licenseStatus?.enforced && licenseStatus.days_remaining !== null && (
                        <div
                            className={licenseStatus.days_remaining <= 5
                                ? 'rounded-xl border-2 border-red-600 bg-red-50 p-5 shadow-lg ring-4 ring-red-100'
                                : 'rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm'}
                            role={licenseStatus.days_remaining <= 5 ? 'alert' : 'status'}
                        >
                            <div className="flex items-start gap-4">
                                <div className={licenseStatus.days_remaining <= 5
                                    ? 'rounded-full bg-red-600 p-3 text-white'
                                    : 'rounded-full bg-blue-600 p-3 text-white'}
                                >
                                    {licenseStatus.days_remaining <= 5
                                        ? <AlertCircle className="h-7 w-7" />
                                        : <CalendarClock className="h-7 w-7" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={licenseStatus.days_remaining <= 5
                                        ? 'text-2xl font-extrabold text-red-800'
                                        : 'text-xl font-bold text-blue-900'}
                                    >
                                        {licenseStatus.days_remaining} {licenseStatus.days_remaining === 1 ? 'day' : 'days'} remaining until license expiry
                                    </p>
                                    {licenseStatus.days_remaining <= 5 && (
                                        <p className="mt-2 text-base font-semibold text-red-800">
                                            If you have already paid, please ignore this message. Otherwise, contact Vibe.exe to renew your license.
                                        </p>
                                    )}
                                    <div className={licenseStatus.days_remaining <= 5
                                        ? 'mt-3 flex flex-wrap gap-x-4 gap-y-2 font-semibold text-red-900'
                                        : 'mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-blue-800'}
                                    >
                                        <a className="underline underline-offset-2" href="tel:03025114945">03025114945</a>
                                        <a className="underline underline-offset-2" href="tel:03402040648">03402040648</a>
                                        <a className="underline underline-offset-2" href="mailto:info@vibeexe.com">info@vibeexe.com</a>
                                        <a className="underline underline-offset-2" href="https://www.vibeexe.com" target="_blank" rel="noreferrer">www.vibeexe.com</a>
                                    </div>
                                    {licenseStatus.expires_at && (
                                        <p className="mt-2 text-xs opacity-75">
                                            Expiry date: {new Date(licenseStatus.expires_at).toLocaleString('en-PK')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

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
                            <div className="rounded-lg border p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <ImagePlus className="h-5 w-5" />
                                    <div>
                                        <p className="font-medium">Business Logo</p>
                                        <p className="text-sm text-muted-foreground">Optional. PNG, JPEG, or WebP up to 2 MB.</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-4">
                                    {logoUrl && (
                                        <div className="flex h-24 w-40 items-center justify-center rounded-md border bg-white p-2">
                                            <Image src={logoUrl} alt="Business logo" width={144} height={80} unoptimized className="max-h-20 w-auto object-contain" />
                                        </div>
                                    )}
                                    <label className="inline-flex cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
                                        {logoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                        {logoUrl ? 'Replace Logo' : 'Upload Logo'}
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp"
                                            className="sr-only"
                                            disabled={logoLoading}
                                            onChange={event => {
                                                void handleLogoUpload(event.target.files?.[0]);
                                                event.currentTarget.value = '';
                                            }}
                                        />
                                    </label>
                                    {logoUrl && (
                                        <Button type="button" variant="outline" disabled={logoLoading} onClick={() => void handleLogoDelete()}>
                                            <Trash2 className="mr-2 h-4 w-4" />Remove Logo
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-lg border p-4 space-y-5">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5" />
                                    <div>
                                        <p className="font-medium">Invoice Design</p>
                                        <p className="text-sm text-muted-foreground">Choose defaults. Staff can override the format on each invoice.</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Default print format</Label>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        {invoiceFormats.map(format => (
                                            <button
                                                key={`print-${format.id}`}
                                                type="button"
                                                onClick={() => setStoreForm(form => ({ ...form, default_print_format: format.id }))}
                                                className={`rounded-lg border p-3 text-left transition ${storeForm.default_print_format === format.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60'}`}
                                            >
                                                <span className="block font-medium">{format.title}</span>
                                                <span className="mt-1 block text-xs text-muted-foreground">{format.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Default print design</Label>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        {invoiceDesigns.map(design => (
                                            <button
                                                key={`print-design-${design.id}`}
                                                type="button"
                                                onClick={() => setStoreForm(form => ({ ...form, default_print_design: design.id }))}
                                                className={`rounded-lg border p-3 text-left transition ${storeForm.default_print_design === design.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60'}`}
                                            >
                                                <span className={`mb-3 block overflow-hidden rounded border bg-white p-2 ${design.id === 'minimal' ? 'border-slate-200' : design.id === 'modern' ? 'border-sky-200' : 'border-slate-400'}`}>
                                                    <span className={`block h-2 rounded-sm ${design.id === 'modern' ? 'bg-sky-800' : design.id === 'minimal' ? 'w-1/2 bg-slate-300' : 'bg-black'}`} />
                                                    <span className="mt-2 block h-1 w-3/4 bg-slate-200" />
                                                    <span className="mt-1 block h-1 w-full bg-slate-100" />
                                                    <span className={`mt-2 block h-3 ${design.id === 'modern' ? 'rounded bg-sky-50' : design.id === 'minimal' ? 'border-t border-slate-200' : 'border-y border-black'}`} />
                                                </span>
                                                <span className="block font-medium">{design.title}</span>
                                                <span className="mt-1 block text-xs text-muted-foreground">{design.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Default WhatsApp format</Label>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        {invoiceFormats.map(format => (
                                            <button
                                                key={`whatsapp-${format.id}`}
                                                type="button"
                                                onClick={() => setStoreForm(form => ({ ...form, default_whatsapp_format: format.id }))}
                                                className={`rounded-lg border p-3 text-left transition ${storeForm.default_whatsapp_format === format.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60'}`}
                                            >
                                                <span className="block font-medium">{format.title}</span>
                                                <span className="mt-1 block text-xs text-muted-foreground">{format.id === 'professional' ? 'Sent as a PDF document.' : 'Sent as an image.'}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Default WhatsApp design</Label>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        {invoiceDesigns.map(design => (
                                            <button
                                                key={`whatsapp-design-${design.id}`}
                                                type="button"
                                                onClick={() => setStoreForm(form => ({ ...form, default_whatsapp_design: design.id }))}
                                                className={`rounded-lg border p-3 text-left transition ${storeForm.default_whatsapp_design === design.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60'}`}
                                            >
                                                <span className={`mb-3 block overflow-hidden rounded border bg-white p-2 ${design.id === 'minimal' ? 'border-slate-200' : design.id === 'modern' ? 'border-sky-200' : 'border-slate-400'}`}>
                                                    <span className={`block h-2 rounded-sm ${design.id === 'modern' ? 'bg-sky-800' : design.id === 'minimal' ? 'w-1/2 bg-slate-300' : 'bg-black'}`} />
                                                    <span className="mt-2 block h-1 w-3/4 bg-slate-200" />
                                                    <span className="mt-1 block h-1 w-full bg-slate-100" />
                                                    <span className={`mt-2 block h-3 ${design.id === 'modern' ? 'rounded bg-sky-50' : design.id === 'minimal' ? 'border-t border-slate-200' : 'border-y border-black'}`} />
                                                </span>
                                                <span className="block font-medium">{design.title}</span>
                                                <span className="mt-1 block text-xs text-muted-foreground">{design.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {[
                                        ['invoice_show_tax_id', 'Show Tax ID / NTN'],
                                        ['invoice_show_cashier', 'Show cashier'],
                                        ['invoice_show_sku', 'Show item SKU'],
                                        ['invoice_show_customer_balance', 'Show customer balance'],
                                    ].map(([field, label]) => (
                                        <div key={field} className="flex items-center gap-3 rounded-md border p-3">
                                            <Checkbox
                                                id={field}
                                                checked={Boolean(storeForm[field as keyof StoreSettingsForm])}
                                                onCheckedChange={checked => setStoreForm(form => ({ ...form, [field]: checked === true }))}
                                            />
                                            <Label htmlFor={field}>{label}</Label>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-1">
                                        <Label htmlFor="invoice_footer_message">Thank-you message</Label>
                                        <Input id="invoice_footer_message" value={storeForm.invoice_footer_message} onChange={event => setStoreForm(form => ({ ...form, invoice_footer_message: event.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="invoice_terms">Terms / return policy</Label>
                                        <textarea
                                            id="invoice_terms"
                                            rows={3}
                                            value={storeForm.invoice_terms}
                                            onChange={event => setStoreForm(form => ({ ...form, invoice_terms: event.target.value }))}
                                            placeholder="One condition per line"
                                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        />
                                    </div>
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
                    <div id="backup-restore" className="scroll-mt-6">
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
                                Only the main POS database is included in backups
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

                    {/* Google Drive Backup */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CloudUpload className="h-5 w-5" />
                                Google Drive Backup
                            </CardTitle>
                            <CardDescription>
                                Every manual and scheduled pos.db backup is saved in the {driveStatus?.folder_name || 'VibePOS Backups'} folder when connected.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {driveMessage && (
                                <Alert variant={driveMessage.type === 'error' ? 'destructive' : 'default'}>
                                    {driveMessage.type === 'success' ? (
                                        <CheckCircle2 className="h-4 w-4" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4" />
                                    )}
                                    <AlertDescription>{driveMessage.text}</AlertDescription>
                                </Alert>
                            )}

                            {driveStatus?.configured === false ? (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>
                                        Google Drive sign-in is not configured in this application build.
                                    </AlertDescription>
                                </Alert>
                            ) : driveStatus?.connected ? (
                                <div className="flex flex-col gap-4 rounded-lg border bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-full bg-white p-2 shadow-sm">
                                            <UserRound className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium">
                                                {driveStatus.account?.display_name || 'Google Drive account'}
                                            </p>
                                            {driveStatus.account?.email && (
                                                <p className="text-sm text-muted-foreground">{driveStatus.account.email}</p>
                                            )}
                                        </div>
                                    </div>
                                    <Badge variant="secondary">Connected</Badge>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Connect a Google account once. A browser window will open so you can approve access.
                                </p>
                            )}

                            <div className="flex flex-col gap-2 sm:flex-row">
                                {driveStatus?.connected ? (
                                    <>
                                        <Button
                                            onClick={handleGoogleDriveUpload}
                                            disabled={driveLoading !== null || dbFiles.length === 0}
                                        >
                                            {driveLoading === 'upload' ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</>
                                            ) : (
                                                <><CloudUpload className="mr-2 h-4 w-4" />Back Up to Drive</>
                                            )}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={handleGoogleDriveDisconnect}
                                            disabled={driveLoading !== null}
                                        >
                                            {driveLoading === 'disconnect' ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disconnecting...</>
                                            ) : (
                                                <><LogOut className="mr-2 h-4 w-4" />Disconnect</>
                                            )}
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        onClick={handleGoogleDriveConnect}
                                        disabled={driveLoading !== null || driveStatus?.configured === false}
                                    >
                                        {driveLoading === 'connect' ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Waiting for Google...</>
                                        ) : (
                                            <><LogIn className="mr-2 h-4 w-4" />Connect Google Account</>
                                        )}
                                    </Button>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Login credentials are encrypted on this POS. WhatsApp and other session databases are never included.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Automatic backup runs daily at 12:00 PM. Local automatic copies are retained for 7 days.
                            </p>

                            {driveStatus?.connected && (
                                <div className="space-y-2 border-t pt-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium">Drive backups</p>
                                        <Badge variant="secondary">{driveBackups.length}</Badge>
                                    </div>
                                    {driveBackups.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No pos.db backups found on Drive.</p>
                                    ) : (
                                        driveBackups.slice(0, 10).map((backup) => (
                                            <div key={backup.file_id} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="break-all font-mono text-sm">{backup.filename}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {backup.created ? formatDate(backup.created) : 'Unknown date'} · {backup.size_mb} MB
                                                    </p>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleGoogleDriveRestore(backup)}
                                                    disabled={restoreLoading || backupLoading || driveLoading !== null}
                                                >
                                                    <CloudDownload className="mr-2 h-4 w-4" />
                                                    Restore
                                                </Button>
                                            </div>
                                        ))
                                    )}
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
                                    Download a safe snapshot of pos.db
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-gray-600">
                                    This creates a timestamped .db file, uploads it to connected Google Drive,
                                    and downloads a local copy.
                                </p>
                                <Button
                                    onClick={handleCreateBackup}
                                    disabled={backupLoading || restoreLoading || dbFiles.length === 0}
                                    className="w-full"
                                >
                                    {backupLoading ? (
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
                                    Upload and restore a VibePOS .db backup
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Alert>
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        <strong>Warning:</strong> Restoring replaces the current pos.db.
                                        A local safety backup is created automatically first. Restart VibePOS after restoring.
                                    </AlertDescription>
                                </Alert>
                                <Button
                                    onClick={handleRestoreBackup}
                                    disabled={backupLoading || restoreLoading}
                                    variant="outline"
                                    className="w-full"
                                >
                                    {restoreLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            {restoreStatus || 'Restoring...'}
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-4 w-4 mr-2" />
                                            Restore Local .db
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
