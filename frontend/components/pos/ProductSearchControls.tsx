'use client';

import type { KeyboardEventHandler, Ref } from 'react';
import { Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface ProductSearchControlsProps {
    categories: string[];
    category: string;
    onCategoryChange: (category: string) => void;
    query: string;
    onQueryChange: (query: string) => void;
    onKeyDown: KeyboardEventHandler<HTMLInputElement>;
    inputRef: Ref<HTMLInputElement>;
}

export function ProductSearchControls({
    categories,
    category,
    onCategoryChange,
    query,
    onQueryChange,
    onKeyDown,
    inputRef,
}: ProductSearchControlsProps) {
    return (
        <div className="bg-muted/40 border-b p-2 flex gap-2 shrink-0">
            <Select value={category} onValueChange={onCategoryChange}>
                <SelectTrigger className="w-32 h-9 shrink-0 text-xs" aria-label="Filter products by category">
                    <Filter className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                    {categories.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    aria-label="Search products by name, SKU, or barcode"
                    placeholder="Search name, SKU, barcode..."
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    className="pl-8 h-9 text-sm"
                />
            </div>
        </div>
    );
}