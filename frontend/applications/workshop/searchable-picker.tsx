'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type SearchablePickerProps<T> = {
    value: string;
    options: T[];
    placeholder: string;
    searchPlaceholder: string;
    emptyText: string;
    getValue: (option: T) => string;
    getSearchText: (option: T) => string;
    renderOption: (option: T) => ReactNode;
    renderValue?: (option: T) => ReactNode;
    onChange: (value: string, option: T) => void;
    addLabel?: string;
    onAdd?: () => void;
    disabled?: boolean;
    className?: string;
};

export function SearchablePicker<T>({
    value,
    options,
    placeholder,
    searchPlaceholder,
    emptyText,
    getValue,
    getSearchText,
    renderOption,
    renderValue,
    onChange,
    addLabel,
    onAdd,
    disabled = false,
    className,
}: SearchablePickerProps<T>) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const selected = options.find((option) => getValue(option) === value);
    const filteredOptions = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        if (!normalized) return options;
        return options.filter((option) => getSearchText(option).toLocaleLowerCase().includes(normalized));
    }, [getSearchText, options, query]);

    return (
        <Popover open={open} onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery('');
        }}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn('h-10 w-full justify-between px-3 font-normal', !selected && 'text-muted-foreground', className)}
                >
                    <span className="min-w-0 truncate text-left">
                        {selected ? (renderValue ? renderValue(selected) : renderOption(selected)) : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                <div className="border-b p-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={searchPlaceholder}
                            className="h-9 pl-8"
                            autoFocus
                        />
                    </div>
                </div>
                <div role="listbox" className="max-h-64 overflow-y-auto p-1">
                    {filteredOptions.length === 0 && (
                        <p className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
                    )}
                    {filteredOptions.map((option) => {
                        const optionValue = getValue(option);
                        return (
                            <button
                                key={optionValue}
                                type="button"
                                role="option"
                                aria-selected={optionValue === value}
                                className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                                onClick={() => {
                                    onChange(optionValue, option);
                                    setOpen(false);
                                }}
                            >
                                <Check className={cn('mt-0.5 h-4 w-4 shrink-0', optionValue === value ? 'opacity-100' : 'opacity-0')} />
                                <span className="min-w-0 flex-1">{renderOption(option)}</span>
                            </button>
                        );
                    })}
                </div>
                {addLabel && onAdd && (
                    <div className="border-t p-1">
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent focus:bg-accent focus:outline-none"
                            onClick={() => {
                                setOpen(false);
                                onAdd();
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            {addLabel}
                        </button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
