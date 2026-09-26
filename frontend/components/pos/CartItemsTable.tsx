'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus, Settings, ShoppingCart, Trash2 } from 'lucide-react';

interface CartProduct {
    id: number;
    name: string;
    selling_price: number;
    allow_decimal_qty: boolean;
    base_unit: string;
    selling_units: { unit: string; price: number }[];
}

interface CartVariation {
    id: number;
    attributes: Record<string, string>;
    price_adjustment: number;
}

export interface CartDisplayItem {
    product: CartProduct;
    quantity: number;
    variation?: CartVariation;
    unit: string;
    item_discount?: number;
    unit_price?: number;
}

interface CartItemsTableProps {
    items: CartDisplayItem[];
    onClear: () => void;
    onQuantityChange: (index: number, quantity: number) => void;
    onDiscountChange: (index: number, discount: number) => void;
    onEdit: (index: number) => void;
    onRemove: (index: number) => void;
}

export function CartItemsTable({
    items,
    onClear,
    onQuantityChange,
    onDiscountChange,
    onEdit,
    onRemove,
}: CartItemsTableProps) {
    return (
        <>
            <div className="bg-primary text-primary-foreground flex items-center text-xs font-semibold select-none shrink-0">
                <div className="grid flex-1" style={{ gridTemplateColumns: '2rem 1fr 7rem 6rem 6rem 6rem 3.5rem' }}>
                    <span className="px-2 py-2 text-center">#</span>
                    <span className="px-3 py-2">Description</span>
                    <span className="px-2 py-2 text-center">Qty</span>
                    <span className="px-2 py-2 text-right">Rate</span>
                    <span className="px-2 py-2 text-right">Disc</span>
                    <span className="px-2 py-2 text-right">Total</span>
                    <span className="px-2 py-2" />
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-300 hover:text-red-100 hover:bg-red-800/40 mr-1 shrink-0"
                    onClick={onClear}
                >
                    Clear
                </Button>
            </div>

            <div className="overflow-y-auto bg-white" style={{ flex: 4 }}>
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                        <ShoppingCart className="h-10 w-10 opacity-20" />
                        <p className="text-sm">Cart is empty — search or click a product</p>
                    </div>
                ) : (
                    <table className="w-full text-sm border-collapse">
                        <tbody>
                            {items.map((item, index) => {
                                let itemPrice = typeof item.unit_price === 'number'
                                    ? item.unit_price
                                    : item.product.selling_price;
                                if (item.variation && typeof item.unit_price !== 'number') {
                                    itemPrice += item.variation.price_adjustment;
                                }
                                if (item.unit !== item.product.base_unit && typeof item.unit_price !== 'number') {
                                    const sellingUnit = item.product.selling_units.find((unit) => unit.unit === item.unit);
                                    if (sellingUnit) itemPrice = sellingUnit.price;
                                }
                                const lineTotal = itemPrice * item.quantity - (item.item_discount || 0);

                                return (
                                    <tr
                                        key={`${item.product.id}-${item.variation?.id || 'base'}-${item.unit}`}
                                        className="border-b hover:bg-blue-50/40 transition-colors"
                                    >
                                        <td className="px-2 py-2 text-center text-muted-foreground w-8">{index + 1}</td>
                                        <td className="px-3 py-2">
                                            <p className="font-medium leading-tight">{item.product.name}</p>
                                            {item.variation && (
                                                <p className="text-xs text-purple-600 mt-0.5">
                                                    {Object.entries(item.variation.attributes).map(([key, value]) => `${key}: ${value}`).join(', ')}
                                                </p>
                                            )}
                                            {typeof item.unit_price === 'number' && (
                                                <span className="text-[10px] text-blue-600">(price override)</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 w-28">
                                            <div className="flex items-center justify-center gap-1">
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    className="h-6 w-6"
                                                    aria-label={`Decrease ${item.product.name} quantity`}
                                                    onClick={() => onQuantityChange(
                                                        index,
                                                        item.quantity - (item.product.allow_decimal_qty ? 0.25 : 1),
                                                    )}
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </Button>
                                                <span className="w-7 text-center font-semibold tabular-nums">{item.quantity}</span>
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    className="h-6 w-6"
                                                    aria-label={`Increase ${item.product.name} quantity`}
                                                    onClick={() => onQuantityChange(
                                                        index,
                                                        item.quantity + (item.product.allow_decimal_qty ? 0.25 : 1),
                                                    )}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground w-24">
                                            {itemPrice.toFixed(2)}
                                        </td>
                                        <td className="px-2 py-2 w-24">
                                            <Input
                                                type="number"
                                                className="h-7 w-20 text-right text-sm ml-auto"
                                                value={item.item_discount || ''}
                                                placeholder="0"
                                                min="0"
                                                aria-label={`Discount for ${item.product.name}`}
                                                onFocus={(event) => event.target.select()}
                                                onChange={(event) => onDiscountChange(
                                                    index,
                                                    parseFloat(event.target.value) || 0,
                                                )}
                                            />
                                        </td>
                                        <td className="px-2 py-2 text-right font-bold text-primary tabular-nums w-24">
                                            {lineTotal.toFixed(2)}
                                        </td>
                                        <td className="px-1 py-2 text-center w-14">
                                            <div className="flex flex-col gap-0.5 items-center">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6 text-blue-500 hover:text-blue-700"
                                                    title="Edit"
                                                    aria-label={`Edit ${item.product.name}`}
                                                    onClick={() => onEdit(index)}
                                                >
                                                    <Settings className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6 text-red-500 hover:text-red-700"
                                                    aria-label={`Remove ${item.product.name}`}
                                                    onClick={() => onRemove(index)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}