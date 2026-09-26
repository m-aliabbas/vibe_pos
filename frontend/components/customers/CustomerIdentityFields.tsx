'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CustomerIdentityValues {
    name?: string;
    phone?: string;
    customer_id?: string;
    email?: string;
    address?: string;
}

type IdentityField = keyof CustomerIdentityValues;

interface CustomerIdentityFieldsProps {
    idPrefix: string;
    values: CustomerIdentityValues;
    onChange: (field: IdentityField, value: string) => void;
    includeCustomerId?: boolean;
    includeEmail?: boolean;
}

export function CustomerIdentityFields({
    idPrefix,
    values,
    onChange,
    includeCustomerId = false,
    includeEmail = true,
}: CustomerIdentityFieldsProps) {
    const idFor = (field: IdentityField) => `${idPrefix}-${field}`;

    return (
        <>
            <div className={`grid ${includeCustomerId ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                <div className="space-y-2">
                    <Label htmlFor={idFor('phone')}>Phone Number</Label>
                    <Input
                        id={idFor('phone')}
                        placeholder="03171585452"
                        value={values.phone || ''}
                        onChange={(event) => onChange('phone', event.target.value)}
                    />
                </div>
                {includeCustomerId && (
                    <div className="space-y-2">
                        <Label htmlFor={idFor('customer_id')}>Customer ID (Optional)</Label>
                        <Input
                            id={idFor('customer_id')}
                            placeholder="CUST001"
                            value={values.customer_id || ''}
                            onChange={(event) => onChange('customer_id', event.target.value.toUpperCase())}
                        />
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <Label htmlFor={idFor('name')}>Full Name</Label>
                <Input
                    id={idFor('name')}
                    placeholder="Customer name"
                    value={values.name || ''}
                    onChange={(event) => onChange('name', event.target.value)}
                />
            </div>

            {includeEmail && (
                <div className="space-y-2">
                    <Label htmlFor={idFor('email')}>Email (Optional)</Label>
                    <Input
                        id={idFor('email')}
                        type="email"
                        placeholder="customer@example.com"
                        value={values.email || ''}
                        onChange={(event) => onChange('email', event.target.value)}
                    />
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor={idFor('address')}>Address (Optional)</Label>
                <Input
                    id={idFor('address')}
                    placeholder="Street, city"
                    value={values.address || ''}
                    onChange={(event) => onChange('address', event.target.value)}
                />
            </div>
        </>
    );
}