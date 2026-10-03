'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    workshopApi,
    type WorkshopCustomer,
    type WorkshopDueService,
    type WorkshopJob,
    type WorkshopJobStatus,
    type WorkshopOilProduct,
    type WorkshopServiceRecord,
} from '@/lib/api';

const NEXT_STATUS: Record<string, WorkshopJobStatus | undefined> = {
    open: 'in_progress',
    in_progress: 'ready',
    ready: 'delivered',
};

function errorMessage(error: unknown): string {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === 'string' ? detail : 'Request failed';
}

const num = (value: string) => (value.trim() === '' ? undefined : Number(value));

export function WorkshopConsole() {
    const [message, setMessage] = useState<string | null>(null);
    const [jobs, setJobs] = useState<WorkshopJob[]>([]);
    const [oils, setOils] = useState<WorkshopOilProduct[]>([]);
    const [due, setDue] = useState<WorkshopDueService[]>([]);
    const [selectedJob, setSelectedJob] = useState<WorkshopJob | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [j, o, d] = await Promise.all([
                workshopApi.listJobs(true),
                workshopApi.listOil(),
                workshopApi.dueServices(),
            ]);
            setJobs(j);
            setOils(o);
            setDue(d);
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
        void refresh();
    }, [refresh]);

    const run = async (action: () => Promise<void>) => {
        setMessage(null);
        try {
            await action();
            await refresh();
        } catch (error) {
            setMessage(errorMessage(error));
        }
    };

    return (
        <div className="space-y-4">
            {message && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">{message}</p>}
            <Tabs defaultValue="checkin">
                <TabsList>
                    <TabsTrigger value="checkin">Check-in</TabsTrigger>
                    <TabsTrigger value="jobs">Job cards ({jobs.length})</TabsTrigger>
                    <TabsTrigger value="oil">Oil stock</TabsTrigger>
                    <TabsTrigger value="due">Due services ({due.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="checkin">
                    <CheckIn
                        run={run}
                        onJob={(job) => {
                            setSelectedJob(job);
                            if (job.warnings.length) setMessage(job.warnings.join(' '));
                        }}
                    />
                </TabsContent>
                <TabsContent value="jobs">
                    <JobCards jobs={jobs} oils={oils} selected={selectedJob} onSelect={setSelectedJob} run={run} />
                </TabsContent>
                <TabsContent value="oil">
                    <OilStock oils={oils} run={run} />
                </TabsContent>
                <TabsContent value="due">
                    <DueList due={due} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

type Run = (action: () => Promise<void>) => Promise<void>;

function CheckIn({ run, onJob }: { run: Run; onJob: (job: WorkshopJob) => void }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<WorkshopCustomer[]>([]);
    const [history, setHistory] = useState<WorkshopServiceRecord[]>([]);
    const [form, setForm] = useState({ name: '', whatsapp: '', plate: '', make: '', model: '', year: '', oil: '' });
    const [odometer, setOdometer] = useState<Record<number, string>>({});
    const [complaint, setComplaint] = useState('');

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm({ ...form, [key]: e.target.value });

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader><CardTitle className="text-base">Find by plate or WhatsApp</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2">
                        <Input placeholder="Plate or WhatsApp" value={query} onChange={(e) => setQuery(e.target.value)} />
                        <Button onClick={() => run(async () => setResults(await workshopApi.lookup(query)))}>Search</Button>
                    </div>
                    <Input placeholder="Complaint / notes for new job" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
                    {results.map((customer) => (
                        <div key={customer.id} className="rounded border p-3 text-sm">
                            <p className="font-medium">{customer.name} · {customer.whatsapp}</p>
                            {customer.vehicles.map((v) => (
                                <div key={v.id} className="mt-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">{v.plate_number}</Badge>
                                    <span>{[v.make, v.model, v.year].filter(Boolean).join(' ')}</span>
                                    <Input
                                        className="w-28" type="number" min={0} placeholder="KM"
                                        value={odometer[v.id] ?? ''}
                                        onChange={(e) => setOdometer({ ...odometer, [v.id]: e.target.value })}
                                    />
                                    <Button size="sm" disabled={!odometer[v.id]} onClick={() => run(async () =>
                                        onJob(await workshopApi.createJob({ vehicle_id: v.id, odometer_km: Number(odometer[v.id]), complaint }))
                                    )}>Open job</Button>
                                    <Button size="sm" variant="outline" onClick={() => run(async () => setHistory(await workshopApi.vehicleHistory(v.id)))}>History</Button>
                                </div>
                            ))}
                        </div>
                    ))}
                    {history.length > 0 && (
                        <ul className="text-sm">
                            {history.map((r) => (
                                <li key={r.id}>{r.service_date}: {r.item_type} at {r.odometer_km} km → next {r.next_due_km ?? '-'} km / {r.next_due_date ?? '-'}</li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-base">Register customer and car</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                    <Input placeholder="Customer name" value={form.name} onChange={set('name')} />
                    <Input placeholder="WhatsApp (with country code)" value={form.whatsapp} onChange={set('whatsapp')} />
                    <Input placeholder="Plate number" value={form.plate} onChange={set('plate')} />
                    <div className="grid grid-cols-3 gap-2">
                        <Input placeholder="Make" value={form.make} onChange={set('make')} />
                        <Input placeholder="Model" value={form.model} onChange={set('model')} />
                        <Input placeholder="Year" type="number" value={form.year} onChange={set('year')} />
                    </div>
                    <Input placeholder="Engine / oil type" value={form.oil} onChange={set('oil')} />
                    <Button disabled={!form.name || !form.whatsapp || !form.plate} onClick={() => run(async () => {
                        const customer = await workshopApi.register({
                            name: form.name,
                            whatsapp: form.whatsapp,
                            vehicle: {
                                plate_number: form.plate, make: form.make || null, model: form.model || null,
                                year: num(form.year) ?? null, engine_oil_type: form.oil || null,
                            },
                        });
                        setResults([customer]);
                        setQuery(form.plate);
                        setForm({ name: '', whatsapp: '', plate: '', make: '', model: '', year: '', oil: '' });
                    })}>Register</Button>
                </CardContent>
            </Card>
        </div>
    );
}

function JobCards({ jobs, oils, selected, onSelect, run }: {
    jobs: WorkshopJob[]; oils: WorkshopOilProduct[]; selected: WorkshopJob | null;
    onSelect: (job: WorkshopJob | null) => void; run: Run;
}) {
    const [line, setLine] = useState({ kind: 'oil', oilId: '', description: '', quantity: '', price: '', km: '', months: '' });
    const [discount, setDiscount] = useState('');
    const apply = (action: () => Promise<WorkshopJob>) => run(async () => onSelect(await action()));

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader><CardTitle className="text-base">In the shop</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                    {jobs.length === 0 && <p className="text-sm text-muted-foreground">No active jobs.</p>}
                    {jobs.map((job) => (
                        <button key={job.id} type="button" onClick={() => onSelect(job)}
                            className="flex w-full items-center justify-between rounded border p-2 text-left text-sm hover:bg-gray-50">
                            <span>#{job.id} {job.plate_number} · {job.customer_name}</span>
                            <Badge>{job.status}</Badge>
                        </button>
                    ))}
                </CardContent>
            </Card>
            {selected && (
                <Card className="print:shadow-none">
                    <CardHeader><CardTitle className="text-base">Job #{selected.id} · {selected.plate_number} · {selected.status}</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p>{selected.customer_name} · {selected.odometer_km} km{selected.complaint ? ` · ${selected.complaint}` : ''}</p>
                        <ul className="space-y-1">
                            {selected.lines.map((l) => (
                                <li key={l.id} className="flex justify-between">
                                    <span>{l.description} × {l.quantity}{l.kind === 'oil' ? ' L' : ''}</span>
                                    <span>{(l.quantity * l.unit_price).toFixed(2)}
                                        {selected.status !== 'delivered' && (
                                            <button className="ml-2 text-red-600 print:hidden" onClick={() => apply(() => workshopApi.removeLine(selected.id, l.id))}>remove</button>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p className="font-medium">Subtotal {selected.subtotal.toFixed(2)} · Discount {selected.discount.toFixed(2)} · Total {selected.total.toFixed(2)}</p>
                        {selected.service_records.map((r) => (
                            <p key={r.id} className="rounded bg-green-50 p-2">
                                {r.item_type}: serviced at {r.odometer_km} km — next due {r.next_due_km ?? '-'} km / {r.next_due_date ?? '-'}
                            </p>
                        ))}
                        {selected.status !== 'delivered' && (
                            <div className="grid grid-cols-2 gap-2 print:hidden">
                                <select className="rounded border p-2" value={line.kind} onChange={(e) => setLine({ ...line, kind: e.target.value })}>
                                    <option value="oil">Oil</option><option value="part">Part</option><option value="labour">Labour</option>
                                </select>
                                {line.kind === 'oil' ? (
                                    <select className="rounded border p-2" value={line.oilId} onChange={(e) => setLine({ ...line, oilId: e.target.value })}>
                                        <option value="">Select oil</option>
                                        {oils.map((o) => <option key={o.id} value={o.id}>{o.name} {o.grade} ({o.total_litres} L)</option>)}
                                    </select>
                                ) : (
                                    <Input placeholder="Description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} />
                                )}
                                <Input type="number" step="0.001" placeholder={line.kind === 'oil' ? 'Litres' : 'Qty'} value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} />
                                <Input type="number" placeholder="Unit price (oil: default)" value={line.price} onChange={(e) => setLine({ ...line, price: e.target.value })} />
                                <Input type="number" placeholder="Interval KM" value={line.km} onChange={(e) => setLine({ ...line, km: e.target.value })} />
                                <Input type="number" placeholder="Interval months" value={line.months} onChange={(e) => setLine({ ...line, months: e.target.value })} />
                                <Button onClick={() => apply(async () => {
                                    const result = await workshopApi.addLine(selected.id, {
                                        kind: line.kind as 'oil' | 'part' | 'labour',
                                        oil_product_id: line.kind === 'oil' ? Number(line.oilId) : undefined,
                                        description: line.description || undefined,
                                        quantity: Number(line.quantity),
                                        unit_price: num(line.price),
                                        interval_km: num(line.km),
                                        interval_months: num(line.months),
                                    });
                                    setLine({ ...line, quantity: '', price: '', description: '' });
                                    return result;
                                })}>Add line</Button>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2 print:hidden">
                            {selected.status !== 'delivered' && (
                                <>
                                    <Input className="w-28" type="number" placeholder="Discount" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                                    <Button variant="outline" onClick={() => apply(() => workshopApi.updateJob(selected.id, { discount: Number(discount) }))}>Set discount</Button>
                                </>
                            )}
                            {NEXT_STATUS[selected.status] && (
                                <Button onClick={() => apply(() => workshopApi.updateJob(selected.id, { status: NEXT_STATUS[selected.status] }))}>
                                    Move to {NEXT_STATUS[selected.status]}
                                </Button>
                            )}
                            {selected.whatsapp_link && (
                                <Button variant="outline" asChild><a href={selected.whatsapp_link} target="_blank" rel="noreferrer">WhatsApp</a></Button>
                            )}
                            <Button variant="outline" onClick={() => window.print()}>Print receipt / sticker</Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function OilStock({ oils, run }: { oils: WorkshopOilProduct[]; run: Run }) {
    const empty = { name: '', grade: '', size: '4', sealed: '0', price: '', cost: '', km: '5000', months: '6' };
    const [form, setForm] = useState(empty);
    const set = (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm({ ...form, [key]: e.target.value });

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader><CardTitle className="text-base">Oil stock</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                    {oils.map((o) => (
                        <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                            <span>
                                {o.name} {o.grade} — {o.sealed_containers} × {o.container_litres} L sealed + {o.open_litres} L open
                                {o.low_stock && <Badge className="ml-2" variant="destructive">Low</Badge>}
                            </span>
                            <span className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => run(async () => { await workshopApi.adjustOil(o.id, { add_sealed_containers: 1 }); })}>+1 sealed</Button>
                                <Button size="sm" variant="outline" onClick={() => {
                                    const litres = Number(window.prompt('Wastage / spillage in litres'));
                                    if (litres > 0) void run(async () => { await workshopApi.adjustOil(o.id, { wastage_litres: litres }); });
                                }}>Wastage</Button>
                            </span>
                        </div>
                    ))}
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-base">Add oil product</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                    <Input placeholder="Name" value={form.name} onChange={set('name')} />
                    <Input placeholder="Grade (5W-30)" value={form.grade} onChange={set('grade')} />
                    <Input type="number" placeholder="Container litres" value={form.size} onChange={set('size')} />
                    <Input type="number" placeholder="Sealed containers" value={form.sealed} onChange={set('sealed')} />
                    <Input type="number" placeholder="Price per litre" value={form.price} onChange={set('price')} />
                    <Input type="number" placeholder="Cost per container" value={form.cost} onChange={set('cost')} />
                    <Input type="number" placeholder="Default interval KM" value={form.km} onChange={set('km')} />
                    <Input type="number" placeholder="Default interval months" value={form.months} onChange={set('months')} />
                    <Button disabled={!form.name || !form.size} onClick={() => run(async () => {
                        await workshopApi.createOil({
                            name: form.name, grade: form.grade || null, container_litres: Number(form.size),
                            sealed_containers: Number(form.sealed) || 0, open_litres: 0,
                            price_per_litre: Number(form.price) || 0, cost_per_container: Number(form.cost) || 0,
                            default_interval_km: num(form.km) ?? null, default_interval_months: num(form.months) ?? null,
                            low_stock_containers: 2,
                        });
                        setForm(empty);
                    })}>Save</Button>
                </CardContent>
            </Card>
        </div>
    );
}

function DueList({ due }: { due: WorkshopDueService[] }) {
    return (
        <Card>
            <CardHeader><CardTitle className="text-base">Services due or overdue</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
                {due.length === 0 && <p className="text-muted-foreground">Nothing due.</p>}
                {due.map((d) => (
                    <div key={`${d.vehicle_id}-${d.item_type}`} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                        <span>
                            {d.plate_number} · {d.customer_name} · {d.item_type} — due {d.next_due_km ?? '-'} km / {d.next_due_date ?? '-'} (now {d.current_km} km)
                            {d.overdue && <Badge className="ml-2" variant="destructive">Overdue</Badge>}
                        </span>
                        <Button size="sm" variant="outline" asChild><a href={d.whatsapp_link} target="_blank" rel="noreferrer">Remind on WhatsApp</a></Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
