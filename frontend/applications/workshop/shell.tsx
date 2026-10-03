'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppConfig } from '@/components/AppConfigProvider';
import { SearchablePicker } from '@/applications/workshop/searchable-picker';
import {
    customerApi,
    workshopApi,
    type CustomerListResponse,
    type WorkshopJob,
    type WorkshopJobLineInput,
    type WorkshopProductOption,
    type WorkshopVehicle,
} from '@/lib/api';
import { Car, PackagePlus, Plus, Search, ShoppingCart, Wrench } from 'lucide-react';


type VehicleForm = {
    customer_id: string;
    registration_number: string;
    make: string;
    model: string;
    current_mileage: string;
};

type JobLineForm = WorkshopJobLineInput & { key: string };

type CustomerForm = {
    name: string;
    phone: string;
    customer_id: string;
};

const emptyVehicle: VehicleForm = {
    customer_id: '', registration_number: '', make: '', model: '', current_mileage: '',
};

const emptyCustomer: CustomerForm = { name: '', phone: '', customer_id: '' };

function newLine(): JobLineForm {
    return { key: crypto.randomUUID(), product_id: 0, quantity: 1, unit: 'piece', item_discount: 0 };
}

function money(value: number) {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value);
}

function uniqueValues(values: Array<string | null | undefined>) {
    return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort();
}

function requestErrorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string') {
        return error.response.data.detail;
    }
    return fallback;
}

export function WorkshopShell() {
    const { config, status } = useAppConfig();
    const [search, setSearch] = useState('');
    const [vehicles, setVehicles] = useState<WorkshopVehicle[]>([]);
    const [vehicleOptions, setVehicleOptions] = useState<WorkshopVehicle[]>([]);
    const [jobs, setJobs] = useState<WorkshopJob[]>([]);
    const [customers, setCustomers] = useState<CustomerListResponse[]>([]);
    const [products, setProducts] = useState<WorkshopProductOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [vehicleDialog, setVehicleDialog] = useState(false);
    const [jobDialog, setJobDialog] = useState(false);
    const [returnToJobAfterVehicle, setReturnToJobAfterVehicle] = useState(false);
    const [showCustomerForm, setShowCustomerForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dialogError, setDialogError] = useState('');
    const [paymentJob, setPaymentJob] = useState<WorkshopJob | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile' | 'other'>('cash');
    const [amountPaid, setAmountPaid] = useState('');
    const [vehicleForm, setVehicleForm] = useState<VehicleForm>(emptyVehicle);
    const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomer);
    const [jobCustomerId, setJobCustomerId] = useState('');
    const [jobVehicleId, setJobVehicleId] = useState('');
    const [currentMileage, setCurrentMileage] = useState('');
    const [interval, setInterval] = useState('5000');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<JobLineForm[]>([newLine()]);
    const [vehicleCustomerFilter, setVehicleCustomerFilter] = useState('all');
    const [vehicleMakeFilter, setVehicleMakeFilter] = useState('all');
    const [vehicleOilFilter, setVehicleOilFilter] = useState('all');

    const loadDashboard = useCallback(async (query = '') => {
        setLoading(true);
        setError('');
        try {
            const [vehicleRows, jobRows] = await Promise.all([
                workshopApi.listVehicles(query),
                workshopApi.listJobs({ search: query || undefined }),
            ]);
            setVehicles(vehicleRows);
            setJobs(jobRows);
        } catch (requestError: unknown) {
            setError(requestErrorMessage(requestError, 'Unable to load workshop data.'));
        } finally {
            setLoading(false);
        }
    }, []);

    const loadLookups = useCallback(async () => {
        try {
            const [vehicleRows, customerRows, productRows] = await Promise.all([
                workshopApi.listVehicles(),
                customerApi.getCustomers({ limit: 500 }),
                workshopApi.listProducts(),
            ]);
            setVehicleOptions(vehicleRows);
            setCustomers(customerRows);
            setProducts(productRows);
        } catch (requestError: unknown) {
            setError(requestErrorMessage(requestError, 'Unable to load customer, vehicle, or product options.'));
        }
    }, []);

    useEffect(() => {
        if (status === 'ready' && config.application_id === 'workshop') void loadLookups();
    }, [config.application_id, loadLookups, status]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (status === 'ready' && config.application_id === 'workshop') void loadDashboard(search);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [config.application_id, loadDashboard, search, status]);

    const selectedVehicle = vehicleOptions.find((vehicle) => vehicle.id === Number(jobVehicleId));
    const availableJobVehicles = useMemo(
        () => jobCustomerId
            ? vehicleOptions.filter((vehicle) => vehicle.customer_id === Number(jobCustomerId))
            : vehicleOptions,
        [jobCustomerId, vehicleOptions],
    );
    const estimatedTotal = useMemo(() => lines.reduce((sum, line) => {
        const product = products.find((item) => item.id === line.product_id);
        if (!product) return sum;
        const unitPrice = line.unit_price ?? product.selling_units.find((unit) => unit.unit === line.unit)?.price
            ?? product.selling_price;
        return sum + Math.max(0, line.quantity * unitPrice - (line.item_discount || 0));
    }, 0), [lines, products]);
    const vehicleMakes = useMemo(() => uniqueValues(vehicleOptions.map((vehicle) => vehicle.make)), [vehicleOptions]);
    const vehicleCustomers = useMemo(() => {
        const byId = new Map<number, string>();
        vehicleOptions.forEach((vehicle) => byId.set(
            vehicle.customer_id,
            vehicle.customer_name || vehicle.customer_phone || `Customer #${vehicle.customer_id}`,
        ));
        return [...byId.entries()].sort((left, right) => left[1].localeCompare(right[1]));
    }, [vehicleOptions]);
    const openJobByVehicle = useMemo(() => {
        const statuses = new Map<number, WorkshopJob['status']>();
        jobs.forEach((job) => {
            if ((job.status === 'open' || job.status === 'in_progress') && !statuses.has(job.vehicle_id)) {
                statuses.set(job.vehicle_id, job.status);
            }
        });
        return statuses;
    }, [jobs]);
    const filteredVehicles = useMemo(() => vehicles.filter((vehicle) => {
        if (vehicleCustomerFilter !== 'all' && vehicle.customer_id !== Number(vehicleCustomerFilter)) return false;
        if (vehicleMakeFilter !== 'all' && vehicle.make !== vehicleMakeFilter) return false;
        const activeJob = openJobByVehicle.get(vehicle.id);
        if (vehicleOilFilter === 'open' && !activeJob) return false;
        if (vehicleOilFilter === 'scheduled' && vehicle.next_oil_change_mileage == null) return false;
        if (vehicleOilFilter === 'untracked' && vehicle.next_oil_change_mileage != null) return false;
        return true;
    }), [openJobByVehicle, vehicleCustomerFilter, vehicleMakeFilter, vehicleOilFilter, vehicles]);

    const refreshWorkshop = async () => {
        await Promise.all([loadDashboard(search), loadLookups()]);
    };

    const openNewJob = () => {
        setDialogError('');
        setJobCustomerId('');
        setJobVehicleId('');
        setCurrentMileage('');
        setInterval('5000');
        setNotes('');
        setLines([newLine()]);
        setJobDialog(true);
    };

    const openJobForVehicle = (vehicle: WorkshopVehicle) => {
        setDialogError('');
        setJobCustomerId(String(vehicle.customer_id));
        setJobVehicleId(String(vehicle.id));
        setCurrentMileage(vehicle.current_mileage == null ? '' : String(vehicle.current_mileage));
        setInterval('5000');
        setNotes('');
        setLines([newLine()]);
        setJobDialog(true);
    };

    const openVehicleForm = (customerId = '', returnToJob = false, createCustomer = false) => {
        setDialogError('');
        setVehicleForm({ ...emptyVehicle, customer_id: customerId });
        setCustomerForm(emptyCustomer);
        setShowCustomerForm(createCustomer);
        setReturnToJobAfterVehicle(returnToJob);
        if (returnToJob) setJobDialog(false);
        setVehicleDialog(true);
    };

    const closeVehicleForm = () => {
        setVehicleDialog(false);
        setDialogError('');
        setShowCustomerForm(false);
        if (returnToJobAfterVehicle) setJobDialog(true);
        setReturnToJobAfterVehicle(false);
    };

    const createCustomer = async () => {
        if (!customerForm.phone.trim() && !customerForm.customer_id.trim()) {
            setDialogError('Enter a phone number or customer ID.');
            return;
        }
        setSaving(true);
        setDialogError('');
        try {
            const customer = await customerApi.findOrCreateCustomer({
                name: customerForm.name.trim() || undefined,
                phone: customerForm.phone.trim() || undefined,
                customer_id: customerForm.customer_id.trim() || undefined,
            });
            setVehicleForm((current) => ({ ...current, customer_id: String(customer.id) }));
            setShowCustomerForm(false);
            setCustomerForm(emptyCustomer);
            await loadLookups();
        } catch (requestError: unknown) {
            setDialogError(requestErrorMessage(requestError, 'Unable to add customer.'));
        } finally {
            setSaving(false);
        }
    };

    const createVehicle = async () => {
        if (!vehicleForm.customer_id) {
            setDialogError('Select a customer.');
            return;
        }
        setSaving(true);
        setDialogError('');
        try {
            const vehicle = await workshopApi.createVehicle({
                customer_id: Number(vehicleForm.customer_id),
                registration_number: vehicleForm.registration_number || undefined,
                make: vehicleForm.make || undefined,
                model: vehicleForm.model || undefined,
                current_mileage: vehicleForm.current_mileage ? Number(vehicleForm.current_mileage) : undefined,
            });
            setVehicleDialog(false);
            setVehicleForm(emptyVehicle);
            setShowCustomerForm(false);
            if (returnToJobAfterVehicle) {
                setJobCustomerId(String(vehicle.customer_id));
                setJobVehicleId(String(vehicle.id));
                setCurrentMileage(vehicle.current_mileage == null ? '' : String(vehicle.current_mileage));
                setJobDialog(true);
            }
            setReturnToJobAfterVehicle(false);
            await refreshWorkshop();
        } catch (requestError: unknown) {
            setDialogError(requestErrorMessage(requestError, 'Unable to create vehicle.'));
        } finally {
            setSaving(false);
        }
    };

    const updateLineProduct = (key: string, productId: number) => {
        const product = products.find((item) => item.id === productId);
        setLines((current) => current.map((line) => line.key === key ? {
            ...line,
            product_id: productId,
            unit: product?.base_unit || 'piece',
            unit_price: product?.selling_price || 0,
        } : line));
    };

    const createJob = async () => {
        if (!jobVehicleId || !currentMileage || Number(interval) <= 0 || lines.some((line) => !line.product_id)) {
            setDialogError('Select a vehicle, enter mileage and interval, and select every product/service line.');
            return;
        }
        setSaving(true);
        setDialogError('');
        try {
            await workshopApi.createJob({
                vehicle_id: Number(jobVehicleId),
                current_mileage: Number(currentMileage),
                oil_change_interval: Number(interval),
                notes: notes || undefined,
                lines: lines.map((line) => ({
                    product_id: line.product_id,
                    variation_id: line.variation_id,
                    quantity: line.quantity,
                    unit: line.unit,
                    unit_price: line.unit_price,
                    item_discount: line.item_discount,
                })),
            });
            setJobDialog(false);
            await refreshWorkshop();
        } catch (requestError: unknown) {
            setDialogError(requestErrorMessage(requestError, 'Unable to create oil-change job.'));
        } finally {
            setSaving(false);
        }
    };

    const changeStatus = async (job: WorkshopJob, next: 'in_progress' | 'cancelled') => {
        setError('');
        try {
            await workshopApi.updateJob(job.id, { status: next });
            await loadDashboard(search);
        } catch (requestError: unknown) {
            setError(requestErrorMessage(requestError, 'Unable to update job.'));
        }
    };

    const openPayment = (job: WorkshopJob) => {
        setPaymentJob(job);
        setPaymentMethod('cash');
        setAmountPaid(String(job.total));
    };

    const completeJob = async () => {
        if (!paymentJob) return;
        setError('');
        setSaving(true);
        try {
            await workshopApi.completeJob(paymentJob.id, {
                payment_method: paymentMethod,
                amount_paid: amountPaid === '' ? undefined : Number(amountPaid),
            });
            setPaymentJob(null);
            await refreshWorkshop();
        } catch (requestError: unknown) {
            setError(requestErrorMessage(requestError, 'Unable to complete job.'));
        } finally {
            setSaving(false);
        }
    };

    if (status === 'loading') return <div className="p-8 text-sm text-muted-foreground">Loading workshop…</div>;
    if (config.application_id !== 'workshop') {
        return <div className="p-8" role="alert">This workspace is only available in Vibe Workshop.</div>;
    }

    return (
        <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
            <div className="mx-auto max-w-7xl space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{config.application_name}</p>
                        <h1 className="text-2xl font-semibold">Oil-change workshop</h1>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" asChild><Link href="/sales"><ShoppingCart />Counter sale</Link></Button>
                        <Button variant="outline" asChild><Link href="/inventory"><PackagePlus />Products & stock</Link></Button>
                        <Button variant="outline" onClick={() => openVehicleForm()}><Car />New vehicle</Button>
                        <Button onClick={openNewJob}><Plus />New oil change</Button>
                    </div>
                </div>

                {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}

                <div className="relative max-w-xl">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9"
                        placeholder="Search vehicle ID, registration, customer name or phone" />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <Summary title="Vehicles" value={vehicles.length} icon={<Car />} />
                    <Summary title="Open jobs" value={jobs.filter((job) => job.status === 'open').length} icon={<Wrench />} />
                    <Summary title="In progress" value={jobs.filter((job) => job.status === 'in_progress').length} icon={<Wrench />} />
                </div>

                <Card>
                    <CardHeader className="gap-3">
                        <CardTitle className="text-base">Vehicles</CardTitle>
                        <div className="grid gap-2 md:grid-cols-3">
                            <select aria-label="Filter vehicles by customer" className="h-9 rounded-md border bg-background px-3 text-sm" value={vehicleCustomerFilter} onChange={(event) => setVehicleCustomerFilter(event.target.value)}>
                                <option value="all">All customers</option>
                                {vehicleCustomers.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                            </select>
                            <select aria-label="Filter vehicles by make" className="h-9 rounded-md border bg-background px-3 text-sm" value={vehicleMakeFilter} onChange={(event) => setVehicleMakeFilter(event.target.value)}>
                                <option value="all">All makes</option>
                                {vehicleMakes.map((make) => <option key={make} value={make}>{make}</option>)}
                            </select>
                            <select aria-label="Filter vehicles by oil-change status" className="h-9 rounded-md border bg-background px-3 text-sm" value={vehicleOilFilter} onChange={(event) => setVehicleOilFilter(event.target.value)}>
                                <option value="all">All oil-change statuses</option>
                                <option value="open">Open / in-progress job</option>
                                <option value="scheduled">Next change scheduled</option>
                                <option value="untracked">No next change</option>
                            </select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {!loading && filteredVehicles.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No vehicles match the filters.</p> : (
                            <Table>
                                <TableHeader><TableRow><TableHead>Vehicle</TableHead><TableHead>Customer</TableHead><TableHead>Make / Model</TableHead><TableHead>Current meter</TableHead><TableHead>Next oil change</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                                <TableBody>{filteredVehicles.map((vehicle) => {
                                    const activeJob = openJobByVehicle.get(vehicle.id);
                                    return (
                                        <TableRow key={vehicle.id}>
                                            <TableCell><div className="font-medium">{vehicle.registration_number || vehicle.vehicle_id}</div><div className="text-xs text-muted-foreground">{vehicle.vehicle_id}</div></TableCell>
                                            <TableCell>{vehicle.customer_name || vehicle.customer_phone || `#${vehicle.customer_id}`}</TableCell>
                                            <TableCell>{[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'}</TableCell>
                                            <TableCell>{vehicle.current_mileage == null ? 'Not recorded' : `${vehicle.current_mileage.toLocaleString()} KM`}</TableCell>
                                            <TableCell>{vehicle.next_oil_change_mileage == null ? 'Not scheduled' : `${vehicle.next_oil_change_mileage.toLocaleString()} KM`}</TableCell>
                                            <TableCell>{activeJob ? <Badge variant="secondary" className="capitalize">{activeJob.replace('_', ' ')}</Badge> : vehicle.last_oil_change_at ? <span className="text-xs text-muted-foreground">Changed {new Date(vehicle.last_oil_change_at).toLocaleDateString()}</span> : '—'}</TableCell>
                                            <TableCell className="text-right"><Button size="sm" onClick={() => openJobForVehicle(vehicle)}>New oil change</Button></TableCell>
                                        </TableRow>
                                    );
                                })}</TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-base">Oil-change jobs</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {!loading && jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs found.</p>}
                        {jobs.map((job) => (
                            <div key={job.id} className="rounded-lg border p-3">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2"><span className="font-medium">{job.job_number}</span><Badge variant="secondary">{job.status.replace('_', ' ')}</Badge></div>
                                        <p className="text-sm text-muted-foreground">{job.vehicle_identifier} · {job.customer_name || job.customer_phone}</p>
                                        <p className="text-xs text-muted-foreground">{job.previous_mileage ?? 'No previous reading'} → {job.current_mileage} KM · Next {job.next_oil_change_mileage} KM</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{money(job.total)}</span>
                                        {job.status === 'open' && <Button size="sm" variant="outline" onClick={() => void changeStatus(job, 'in_progress')}>Start</Button>}
                                        {(job.status === 'open' || job.status === 'in_progress') && <Button size="sm" onClick={() => openPayment(job)}>Complete & invoice</Button>}
                                        {job.sale_id && <Button size="sm" variant="outline" asChild><Link href={`/sales/invoice/${job.sale_id}`}>Invoice</Link></Button>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={vehicleDialog} onOpenChange={(open) => {
                if (open) setVehicleDialog(true);
                else closeVehicleForm();
            }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add vehicle</DialogTitle><DialogDescription>Search for the customer or add them here, then enter the vehicle details.</DialogDescription></DialogHeader>
                    <div className="grid gap-3">
                        <Field label="Customer">
                            <SearchablePicker
                                value={vehicleForm.customer_id}
                                options={customers}
                                placeholder="Search or select customer"
                                searchPlaceholder="Search name, phone, or customer ID"
                                emptyText="No customers found."
                                getValue={(customer) => String(customer.id)}
                                getSearchText={(customer) => `${customer.name || ''} ${customer.phone || ''} ${customer.customer_id || ''}`}
                                renderValue={(customer) => customer.name || customer.phone || customer.customer_id || 'Customer'}
                                renderOption={(customer) => <PickerDetail primary={customer.name || 'Customer'} secondary={[customer.phone, customer.customer_id].filter(Boolean).join(' · ')} />}
                                onChange={(customerId) => setVehicleForm((current) => ({ ...current, customer_id: customerId }))}
                                addLabel="Add new customer"
                                onAdd={() => {
                                    setCustomerForm(emptyCustomer);
                                    setShowCustomerForm(true);
                                    setDialogError('');
                                }}
                            />
                        </Field>
                        {showCustomerForm && (
                            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                                <div>
                                    <p className="text-sm font-medium">New customer</p>
                                    <p className="text-xs text-muted-foreground">Phone or customer ID is required.</p>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Name"><Input value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} placeholder="Customer name" /></Field>
                                    <Field label="Phone"><Input value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} placeholder="0300xxxxxxx" /></Field>
                                </div>
                                <Field label="Customer ID (optional)"><Input value={customerForm.customer_id} onChange={(event) => setCustomerForm((current) => ({ ...current, customer_id: event.target.value }))} placeholder="Auto-generated if blank" /></Field>
                                <div className="flex justify-end gap-2">
                                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowCustomerForm(false)}>Cancel</Button>
                                    <Button type="button" size="sm" disabled={saving} onClick={() => void createCustomer()}>{saving ? 'Adding…' : 'Add customer'}</Button>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3"><Field label="Vehicle ID"><Input value="Generated automatically" readOnly disabled /></Field><Field label="Registration"><Input value={vehicleForm.registration_number} onChange={(event) => setVehicleForm({ ...vehicleForm, registration_number: event.target.value })} placeholder="ABC-123" /></Field></div>
                        <div className="grid grid-cols-2 gap-3"><Field label="Make"><Input list="workshop-vehicle-makes" value={vehicleForm.make} onChange={(event) => setVehicleForm({ ...vehicleForm, make: event.target.value })} placeholder="Search or type make" /></Field><Field label="Model"><Input list="workshop-vehicle-models" value={vehicleForm.model} onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })} placeholder="Search or type model" /></Field></div>
                        <datalist id="workshop-vehicle-makes">{uniqueValues(vehicleOptions.map((vehicle) => vehicle.make)).map((make) => <option key={make} value={make} />)}</datalist>
                        <datalist id="workshop-vehicle-models">{uniqueValues(vehicleOptions.filter((vehicle) => !vehicleForm.make || vehicle.make === vehicleForm.make).map((vehicle) => vehicle.model)).map((model) => <option key={model} value={model} />)}</datalist>
                        <Field label="Current meter reading (KM)"><Input type="number" min="0" value={vehicleForm.current_mileage} onChange={(event) => setVehicleForm({ ...vehicleForm, current_mileage: event.target.value })} /></Field>
                        {dialogError && <DialogError message={dialogError} />}
                    </div>
                    <DialogFooter><Button variant="outline" onClick={closeVehicleForm}>Cancel</Button><Button disabled={saving || showCustomerForm} onClick={() => void createVehicle()}>{saving ? 'Saving…' : 'Save vehicle'}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={jobDialog} onOpenChange={(open) => {
                setJobDialog(open);
                if (!open) setDialogError('');
            }}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader><DialogTitle>New oil change</DialogTitle><DialogDescription>Select the customer and vehicle, then add products and services like a retail sale.</DialogDescription></DialogHeader>
                    <div className="grid gap-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Customer">
                                <SearchablePicker
                                    value={jobCustomerId}
                                    options={customers}
                                    placeholder="Search or select customer"
                                    searchPlaceholder="Search name, phone, or customer ID"
                                    emptyText="No customers found."
                                    getValue={(customer) => String(customer.id)}
                                    getSearchText={(customer) => `${customer.name || ''} ${customer.phone || ''} ${customer.customer_id || ''}`}
                                    renderValue={(customer) => customer.name || customer.phone || customer.customer_id || 'Customer'}
                                    renderOption={(customer) => <PickerDetail primary={customer.name || 'Customer'} secondary={[customer.phone, customer.customer_id].filter(Boolean).join(' · ')} />}
                                    onChange={(customerId) => {
                                        setJobCustomerId(customerId);
                                        if (selectedVehicle?.customer_id !== Number(customerId)) {
                                            setJobVehicleId('');
                                            setCurrentMileage('');
                                        }
                                    }}
                                    addLabel="Add customer and vehicle"
                                    onAdd={() => openVehicleForm('', true, true)}
                                />
                            </Field>
                            <Field label="Vehicle">
                                <SearchablePicker
                                    value={jobVehicleId}
                                    options={availableJobVehicles}
                                    placeholder={jobCustomerId ? 'Search customer vehicles' : 'Search or select vehicle'}
                                    searchPlaceholder="Search registration, vehicle ID, make, or model"
                                    emptyText={jobCustomerId ? 'No vehicles for this customer.' : 'No vehicles found.'}
                                    getValue={(vehicle) => String(vehicle.id)}
                                    getSearchText={(vehicle) => `${vehicle.registration_number || ''} ${vehicle.vehicle_id} ${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.customer_name || ''} ${vehicle.customer_phone || ''}`}
                                    renderValue={(vehicle) => vehicle.registration_number || vehicle.vehicle_id}
                                    renderOption={(vehicle) => <PickerDetail primary={vehicle.registration_number || vehicle.vehicle_id} secondary={`${[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'} · ${vehicle.customer_name || vehicle.customer_phone || 'Customer'}`} />}
                                    onChange={(vehicleId, vehicle) => {
                                        setJobVehicleId(vehicleId);
                                        setJobCustomerId(String(vehicle.customer_id));
                                        setCurrentMileage(vehicle.current_mileage == null ? '' : String(vehicle.current_mileage));
                                    }}
                                    addLabel="Add new vehicle"
                                    onAdd={() => openVehicleForm(jobCustomerId, true)}
                                />
                            </Field>
                        </div>
                        {selectedVehicle && <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Previous reading: {selectedVehicle.current_mileage == null ? 'Not recorded' : `${selectedVehicle.current_mileage.toLocaleString()} KM`} · Vehicle ID: {selectedVehicle.vehicle_id}</div>}
                        <div className="grid grid-cols-2 gap-3"><Field label="Current reading (KM)"><Input type="number" min="0" value={currentMileage} onChange={(event) => setCurrentMileage(event.target.value)} /></Field><Field label="Change again after (KM)"><Input type="number" min="1" value={interval} onChange={(event) => setInterval(event.target.value)} /></Field></div>
                        <div className="space-y-2"><Label>Oil, parts and labour</Label>{lines.map((line) => <JobLineEditor key={line.key} line={line} products={products} onProduct={(id) => updateLineProduct(line.key, id)} onChange={(next) => setLines((current) => current.map((item) => item.key === line.key ? next : item))} onRemove={() => setLines((current) => current.length === 1 ? current : current.filter((item) => item.key !== line.key))} canRemove={lines.length > 1} />)}<Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine()])}><Plus />Add line</Button></div>
                        <Field label="Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Customer request or service notes" /></Field>
                        <div className="rounded-md bg-muted p-3 text-right font-medium">Estimated total: {money(estimatedTotal)}</div>
                        {dialogError && <DialogError message={dialogError} />}
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setJobDialog(false)}>Cancel</Button><Button disabled={saving} onClick={() => void createJob()}>{saving ? 'Saving…' : 'Create job'}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={paymentJob !== null} onOpenChange={(open) => !open && setPaymentJob(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Complete and invoice {paymentJob?.job_number}</DialogTitle>
                        <DialogDescription>
                            Stock, customer balance, invoice, accounting, and the next oil-change reading will post together.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                        <div className="rounded-md bg-muted p-3 text-lg font-semibold">Total: {money(paymentJob?.total || 0)}</div>
                        <Field label="Payment method">
                            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>
                                <option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile</option><option value="other">Other</option>
                            </select>
                        </Field>
                        <Field label="Amount paid now">
                            <Input type="number" min="0" step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} />
                        </Field>
                        {paymentJob && Number(amountPaid || 0) < paymentJob.total && (
                            <p className="text-sm text-amber-700">Customer credit: {money(paymentJob.total - Number(amountPaid || 0))}</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPaymentJob(null)}>Cancel</Button>
                        <Button disabled={saving} onClick={() => void completeJob()}>{saving ? 'Posting…' : 'Complete job'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Summary({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
    return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-semibold">{value}</p></div><div className="text-muted-foreground">{icon}</div></CardContent></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function PickerDetail({ primary, secondary }: { primary: string; secondary?: string }) {
    return <span className="block min-w-0"><span className="block truncate font-medium">{primary}</span>{secondary && <span className="block truncate text-xs text-muted-foreground">{secondary}</span>}</span>;
}

function DialogError({ message }: { message: string }) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700" role="alert">{message}</div>;
}

function JobLineEditor({ line, products, onProduct, onChange, onRemove, canRemove }: {
    line: JobLineForm;
    products: WorkshopProductOption[];
    onProduct: (id: number) => void;
    onChange: (line: JobLineForm) => void;
    onRemove: () => void;
    canRemove: boolean;
}) {
    const product = products.find((item) => item.id === line.product_id);
    const units = product ? [{ unit: product.base_unit, conversion: 1, price: product.selling_price }, ...product.selling_units.filter((unit) => unit.unit !== product.base_unit)] : [];
    const lineTotal = Math.max(0, line.quantity * (line.unit_price || 0) - (line.item_discount || 0));
    return <div className="space-y-2 rounded-md border p-2">
        <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <SearchablePicker
            value={line.product_id ? String(line.product_id) : ''}
            options={products}
            placeholder="Search product/service"
            searchPlaceholder="Search name, SKU, or type"
            emptyText="No products or services found."
            getValue={(item) => String(item.id)}
            getSearchText={(item) => `${item.name} ${item.sku || ''} ${item.item_type}`}
            renderValue={(item) => item.name}
            renderOption={(item) => <PickerDetail primary={item.name} secondary={`${item.sku ? `${item.sku} · ` : ''}${item.item_type} · ${money(item.selling_price)}${item.item_type === 'stock' || item.item_type === 'prepared' ? ` · Stock ${item.quantity.toLocaleString()}` : ''}`} />}
            onChange={(id) => onProduct(Number(id))}
            className="h-9"
        />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={line.unit} onChange={(event) => { const selected = units.find((unit) => unit.unit === event.target.value); onChange({ ...line, unit: event.target.value, unit_price: selected?.price ?? line.unit_price }); }}>{units.length === 0 && <option value={line.unit}>{line.unit}</option>}{units.map((unit) => <option key={unit.unit} value={unit.unit}>{unit.unit}</option>)}</select>
        <Input aria-label="Quantity" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => onChange({ ...line, quantity: Number(event.target.value) })} />
        <Input aria-label="Unit price" type="number" min="0" step="0.01" value={line.unit_price ?? ''} onChange={(event) => onChange({ ...line, unit_price: Number(event.target.value) })} />
        <Button type="button" variant="ghost" size="sm" disabled={!canRemove} onClick={onRemove}>Remove</Button>
        </div>
        {product && <div className="flex justify-between px-1 text-xs text-muted-foreground"><span>{product.item_type === 'stock' || product.item_type === 'prepared' ? `${product.quantity.toLocaleString()} ${product.base_unit} in stock` : product.item_type === 'service' ? 'Service item' : 'Non-stock item'}</span><span>Line total: {money(lineTotal)}</span></div>}
    </div>;
}
