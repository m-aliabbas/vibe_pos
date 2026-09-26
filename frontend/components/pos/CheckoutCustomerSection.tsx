'use client';

import type { KeyboardEventHandler, Ref } from 'react';
import { X } from 'lucide-react';
import type { CustomerSimple } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CheckoutCustomerSectionProps {
    customerId: string;
    customerPhone: string;
    onPhoneChange: (value: string) => void;
    customerSearchLoading: boolean;
    selectedCustomer: CustomerSimple | null;
    onRemoveCustomer: () => void;
    customerName: string;
    onNameChange: (value: string) => void;
    onNameFocus: () => void;
    onNameBlur: () => void;
    onNameKeyDown: KeyboardEventHandler<HTMLInputElement>;
    customerNameLoading: boolean;
    showCustomerNameResults: boolean;
    customerNameResults: CustomerSimple[];
    selectedCustomerNameIndex: number;
    onSelectCustomerNameIndex: (index: number) => void;
    customerNameListRef: Ref<HTMLDivElement>;
    onSelectCustomer: (customer: CustomerSimple) => void;
}

export function CheckoutCustomerSection({
    customerId,
    customerPhone,
    onPhoneChange,
    customerSearchLoading,
    selectedCustomer,
    onRemoveCustomer,
    customerName,
    onNameChange,
    onNameFocus,
    onNameBlur,
    onNameKeyDown,
    customerNameLoading,
    showCustomerNameResults,
    customerNameResults,
    selectedCustomerNameIndex,
    onSelectCustomerNameIndex,
    customerNameListRef,
    onSelectCustomer,
}: CheckoutCustomerSectionProps) {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone Number</Label>
                <Input
                    id="customerPhone"
                    placeholder="e.g., 0300xxxxxxx"
                    value={customerPhone}
                    onChange={(event) => onPhoneChange(event.target.value)}
                />
            </div>

            {customerSearchLoading && (
                <div className="absolute right-6 top-6">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                </div>
            )}

            {selectedCustomer && (
                <div className="p-2 border rounded text-sm bg-green-50 border-green-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-green-800">{selectedCustomer.name || 'Customer'}</p>
                            <p className="text-xs text-green-600">
                                {selectedCustomer.customer_id && `ID: ${selectedCustomer.customer_id}`}
                                {selectedCustomer.phone && ` • Phone: ${selectedCustomer.phone}`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedCustomer.outstanding_balance > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                    Udhar: rs {selectedCustomer.outstanding_balance.toFixed(2)}
                                </Badge>
                            )}
                            {selectedCustomer.outstanding_balance < 0 && (
                                <Badge variant="default" className="text-xs bg-green-600">
                                    Credit: +rs {Math.abs(selectedCustomer.outstanding_balance).toFixed(2)}
                                </Badge>
                            )}
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                                title="Remove customer"
                                aria-label="Remove customer"
                                onClick={onRemoveCustomer}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {!selectedCustomer && (customerId.trim() || customerPhone.trim()) && !customerSearchLoading && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                    <p className="text-blue-800 font-medium mb-1">New customer will be created:</p>
                    {customerId.trim() && (
                        <p>ID: <b>{customerId.trim().toUpperCase()}</b></p>
                    )}
                    {customerPhone.trim() && (
                        <p>Phone: <b>{customerPhone.trim()}</b></p>
                    )}
                </div>
            )}

            {!customerId.trim() && !customerPhone.trim() && (
                <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 font-medium">
                    Walk-in sale (no customer linked)
                </div>
            )}

            <div className="space-y-1 relative">
                <Label htmlFor="customer" className="text-sm">
                    Customer Name (Search / Optional)
                </Label>
                <Input
                    id="customer"
                    placeholder="Type a name to search"
                    value={customerName}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showCustomerNameResults && customerNameResults.length > 0}
                    aria-controls="checkout-customer-results"
                    aria-activedescendant={showCustomerNameResults && customerNameResults[selectedCustomerNameIndex]
                        ? `checkout-customer-result-${customerNameResults[selectedCustomerNameIndex].id}`
                        : undefined}
                    onChange={(event) => onNameChange(event.target.value)}
                    onFocus={onNameFocus}
                    onBlur={onNameBlur}
                    onKeyDown={onNameKeyDown}
                />

                {customerNameLoading && (
                    <div className="absolute right-3 top-9">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                    </div>
                )}

                {showCustomerNameResults && customerNameResults.length > 0 && (
                    <div
                        id="checkout-customer-results"
                        role="listbox"
                        ref={customerNameListRef}
                        className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto"
                    >
                        {customerNameResults.map((customer, index) => (
                            <button
                                key={customer.id}
                                id={`checkout-customer-result-${customer.id}`}
                                role="option"
                                aria-selected={index === selectedCustomerNameIndex}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                    index === selectedCustomerNameIndex
                                        ? 'bg-blue-50 border-l-2 border-blue-500'
                                        : 'hover:bg-gray-50'
                                }`}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => onSelectCustomerNameIndex(index)}
                                onClick={() => onSelectCustomer(customer)}
                            >
                                <div className="font-medium text-gray-900">{customer.name || 'Customer'}</div>
                                <div className="text-xs text-gray-500">
                                    {customer.customer_id ? `ID: ${customer.customer_id}` : ''}
                                    {customer.phone ? ` • ${customer.phone}` : ''}
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {showCustomerNameResults && customerNameResults.length === 0 && !customerNameLoading && (
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg px-3 py-2 text-xs text-gray-500">
                        No customers found
                    </div>
                )}
            </div>
        </>
    );
}