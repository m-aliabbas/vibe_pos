'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, RefreshCcw, BookOpen, FileText, Scale } from 'lucide-react';

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
  is_system: boolean;
  is_active: boolean;
}

interface JournalLine {
  id: number;
  account_id: number;
  debit: number;
  credit: number;
  memo?: string;
  account?: Account;
}

interface JournalEntry {
  id: number;
  entry_date: string;
  description: string;
  source_type?: string;
  source_id?: number;
  created_by?: number;
  lines: JournalLine[];
}

interface TrialBalanceLine {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  debit: number;
  credit: number;
  balance: number;
}

interface TrialBalanceReport {
  as_of?: string;
  total_debits: number;
  total_credits: number;
  lines: TrialBalanceLine[];
}

interface EntryLineDraft {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
}

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

export default function AccountingPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountForm, setAccountForm] = useState({
    code: '',
    name: '',
    type: 'asset',
    is_active: true,
  });

  const [journalStart, setJournalStart] = useState('');
  const [journalEnd, setJournalEnd] = useState('');
  const [trialAsOf, setTrialAsOf] = useState('');

  const [entryDescription, setEntryDescription] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [entrySourceType, setEntrySourceType] = useState('');
  const [entrySourceId, setEntrySourceId] = useState('');
  const [entryLines, setEntryLines] = useState<EntryLineDraft[]>([
    { accountId: '', debit: '', credit: '', memo: '' },
    { accountId: '', debit: '', credit: '', memo: '' },
  ]);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entrySaving, setEntrySaving] = useState(false);

  const fetchAccounts = async () => {
    const response = await api.get('/accounting/accounts');
    setAccounts(response.data || []);
  };

  const fetchJournal = async () => {
    const params: Record<string, string> = {};
    if (journalStart) params.start_date = journalStart;
    if (journalEnd) params.end_date = journalEnd;
    const response = await api.get('/accounting/journal', { params });
    setJournalEntries(response.data || []);
  };

  const fetchTrialBalance = async () => {
    const params: Record<string, string> = {};
    if (trialAsOf) params.as_of = trialAsOf;
    const response = await api.get('/accounting/trial-balance', { params });
    setTrialBalance(response.data || null);
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchAccounts(), fetchJournal(), fetchTrialBalance()]);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load accounting data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/');
      return;
    }
    fetchAll();
  }, [user, router]);

  useEffect(() => {
    fetchJournal();
  }, [journalStart, journalEnd]);

  useEffect(() => {
    fetchTrialBalance();
  }, [trialAsOf]);

  const formatCurrency = (value: number) => `rs ${value.toFixed(2)}`;

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    entryLines.forEach((line) => {
      debit += parseFloat(line.debit || '0') || 0;
      credit += parseFloat(line.credit || '0') || 0;
    });
    return { debit, credit };
  }, [entryLines]);

  const handleAccountCreate = async () => {
    if (!accountForm.code.trim() || !accountForm.name.trim()) {
      setError('Account code and name are required');
      return;
    }
    setError(null);
    try {
      await api.post('/accounting/accounts', accountForm);
      setAccountForm({ code: '', name: '', type: 'asset', is_active: true });
      await fetchAccounts();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create account');
    }
  };

  const handleLineChange = (index: number, field: keyof EntryLineDraft, value: string) => {
    setEntryLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line))
    );
  };

  const handleAddLine = () => {
    setEntryLines((prev) => [...prev, { accountId: '', debit: '', credit: '', memo: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    setEntryLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCreateEntry = async () => {
    setEntryError(null);

    if (!entryDescription.trim()) {
      setEntryError('Description is required');
      return;
    }

    const preparedLines = entryLines
      .filter((line) => line.accountId && (parseFloat(line.debit || '0') > 0 || parseFloat(line.credit || '0') > 0))
      .map((line) => ({
        account_id: Number(line.accountId),
        debit: parseFloat(line.debit || '0') || 0,
        credit: parseFloat(line.credit || '0') || 0,
        memo: line.memo?.trim() || undefined,
      }));

    if (preparedLines.length < 2) {
      setEntryError('Add at least two balanced lines');
      return;
    }

    if (Math.abs(totals.debit - totals.credit) > 0.01) {
      setEntryError('Debits and credits must balance');
      return;
    }

    setEntrySaving(true);
    try {
      await api.post('/accounting/journal', {
        entry_date: entryDate || undefined,
        description: entryDescription.trim(),
        source_type: entrySourceType || undefined,
        source_id: entrySourceId ? Number(entrySourceId) : undefined,
        lines: preparedLines,
      });

      setEntryDescription('');
      setEntryDate('');
      setEntrySourceType('');
      setEntrySourceId('');
      setEntryLines([
        { accountId: '', debit: '', credit: '', memo: '' },
        { accountId: '', debit: '', credit: '', memo: '' },
      ]);

      await Promise.all([fetchJournal(), fetchTrialBalance()]);
    } catch (err: any) {
      setEntryError(err?.response?.data?.detail || 'Failed to create journal entry');
    } finally {
      setEntrySaving(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  if (loading) {
    return <div className="p-8">Loading accounting data...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Accounting</h1>
          <p className="text-gray-500">Double-entry ledger, journal, and trial balance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="trial">Trial Balance</TabsTrigger>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" /> Chart of Accounts
              </CardTitle>
              <CardDescription>System and custom accounts used for posting.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="account-code">Code</Label>
                  <Input
                    id="account-code"
                    value={accountForm.code}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder="1005"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="account-name">Name</Label>
                  <Input
                    id="account-name"
                    value={accountForm.name}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Petty Cash"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={accountForm.type}
                    onValueChange={(value) => setAccountForm((prev) => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleAccountCreate}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Account
              </Button>

              <div className="mt-6 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-semibold">{account.code}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell className="capitalize">{account.type}</TableCell>
                        <TableCell>
                          {account.is_system ? (
                            <Badge variant="secondary">System</Badge>
                          ) : account.is_active ? (
                            <Badge variant="outline">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Inactive</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Journal Entries
              </CardTitle>
              <CardDescription>Posted double-entry transactions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="journal-start">Start date</Label>
                  <Input
                    id="journal-start"
                    type="date"
                    value={journalStart}
                    onChange={(e) => setJournalStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="journal-end">End date</Label>
                  <Input
                    id="journal-end"
                    type="date"
                    value={journalEnd}
                    onChange={(e) => setJournalEnd(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={fetchJournal}>
                    <RefreshCcw className="mr-2 h-4 w-4" /> Apply
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Debit / Credit</TableHead>
                      <TableHead>Lines</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No journal entries found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      journalEntries.map((entry) => {
                        const entryDebit = entry.lines.reduce((acc, line) => acc + (line.debit || 0), 0);
                        const entryCredit = entry.lines.reduce((acc, line) => acc + (line.credit || 0), 0);
                        return (
                          <TableRow key={entry.id}>
                            <TableCell>{new Date(entry.entry_date).toLocaleString()}</TableCell>
                            <TableCell className="font-medium">{entry.description}</TableCell>
                            <TableCell>
                              <div className="text-xs text-muted-foreground">
                                {entry.source_type || 'manual'}
                                {entry.source_id ? ` #${entry.source_id}` : ''}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="text-sm font-semibold">{formatCurrency(entryDebit)}</div>
                              <div className="text-xs text-muted-foreground">{formatCurrency(entryCredit)}</div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {entry.lines.map((line) => (
                                  <div key={line.id} className="text-xs text-muted-foreground">
                                    {line.account?.code} {line.account?.name} —
                                    <span className="ml-1 text-emerald-600">D {formatCurrency(line.debit || 0)}</span>
                                    <span className="ml-2 text-rose-600">C {formatCurrency(line.credit || 0)}</span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" /> Trial Balance
              </CardTitle>
              <CardDescription>Balance check of all accounts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trial-as-of">As of</Label>
                  <Input
                    id="trial-as-of"
                    type="date"
                    value={trialAsOf}
                    onChange={(e) => setTrialAsOf(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={fetchTrialBalance}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Apply
                </Button>
                <div className="ml-auto text-sm text-muted-foreground">
                  Debits: {formatCurrency(trialBalance?.total_debits || 0)} | Credits:{' '}
                  {formatCurrency(trialBalance?.total_credits || 0)}
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalance?.lines?.length ? (
                      trialBalance.lines.map((line) => (
                        <TableRow key={line.account_id}>
                          <TableCell className="font-semibold">{line.code}</TableCell>
                          <TableCell>{line.name}</TableCell>
                          <TableCell className="capitalize">{line.account_type}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.debit)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.credit)}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(line.balance)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No trial balance data.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Manual Journal Entry</CardTitle>
              <CardDescription>Create custom double-entry postings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry-description">Description</Label>
                  <Input
                    id="entry-description"
                    value={entryDescription}
                    onChange={(e) => setEntryDescription(e.target.value)}
                    placeholder="Adjustment for ..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-date">Entry Date</Label>
                  <Input
                    id="entry-date"
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-source">Source Type</Label>
                  <Input
                    id="entry-source"
                    value={entrySourceType}
                    onChange={(e) => setEntrySourceType(e.target.value)}
                    placeholder="adjustment"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-source-id">Source ID</Label>
                  <Input
                    id="entry-source-id"
                    type="number"
                    value={entrySourceId}
                    onChange={(e) => setEntrySourceId(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entryLines.map((line, index) => (
                      <TableRow key={`line-${index}`}>
                        <TableCell className="min-w-[220px]">
                          <Select
                            value={line.accountId}
                            onValueChange={(value) => handleLineChange(index, 'accountId', value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((account) => (
                                <SelectItem key={account.id} value={String(account.id)}>
                                  {account.code} - {account.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right min-w-[120px]">
                          <Input
                            type="number"
                            step="0.01"
                            value={line.debit}
                            onChange={(e) => handleLineChange(index, 'debit', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-right min-w-[120px]">
                          <Input
                            type="number"
                            step="0.01"
                            value={line.credit}
                            onChange={(e) => handleLineChange(index, 'credit', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          <Input
                            value={line.memo}
                            onChange={(e) => handleLineChange(index, 'memo', e.target.value)}
                            placeholder="Optional"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveLine(index)}
                            disabled={entryLines.length <= 2}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <Button variant="outline" onClick={handleAddLine}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Line
                </Button>
                <div className="text-sm text-muted-foreground">
                  Total Debits: {formatCurrency(totals.debit)} | Total Credits: {formatCurrency(totals.credit)}
                </div>
              </div>

              {entryError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {entryError}
                </div>
              )}

              <Button onClick={handleCreateEntry} disabled={entrySaving}>
                {entrySaving ? 'Posting...' : 'Post Entry'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
