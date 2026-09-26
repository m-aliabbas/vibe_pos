'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { CatalogItemType } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export interface SellingUnitFormValue {
    unit: string;
    conversion: string;
    price: string;
}

export interface SellingUnitValue {
    unit: string;
    conversion: number;
    price: number;
}

interface CatalogCapabilityFieldsProps {
    idPrefix: string;
    itemType: CatalogItemType;
    onItemTypeChange: (itemType: CatalogItemType) => void;
    allowDecimalQty: boolean;
    onAllowDecimalQtyChange: (enabled: boolean) => void;
    baseUnit: string;
    onBaseUnitChange: (unit: string) => void;
    hasSellingUnits: boolean;
    onHasSellingUnitsChange: (enabled: boolean) => void;
    sellingUnits: SellingUnitValue[];
    newUnit: SellingUnitFormValue;
    onNewUnitChange: Dispatch<SetStateAction<SellingUnitFormValue>>;
    onAddSellingUnit: () => void;
    onRemoveSellingUnit: (index: number) => void;
    newUnitPriceWords?: string;
    hasVariations: boolean;
    onHasVariationsChange: (enabled: boolean) => void;
    variationAttributes: string[];
    newAttribute: string;
    onNewAttributeChange: (value: string) => void;
    onAddAttribute: () => void;
    onRemoveAttribute: (attribute: string) => void;
    variationHelpText: string;
}

export function CatalogCapabilityFields({
    idPrefix,
    itemType,
    onItemTypeChange,
    allowDecimalQty,
    onAllowDecimalQtyChange,
    baseUnit,
    onBaseUnitChange,
    hasSellingUnits,
    onHasSellingUnitsChange,
    sellingUnits,
    newUnit,
    onNewUnitChange,
    onAddSellingUnit,
    onRemoveSellingUnit,
    newUnitPriceWords,
    hasVariations,
    onHasVariationsChange,
    variationAttributes,
    newAttribute,
    onNewAttributeChange,
    onAddAttribute,
    onRemoveAttribute,
    variationHelpText,
}: CatalogCapabilityFieldsProps) {
    const itemTypeId = `${idPrefix}-item-type`;
    const decimalId = `${idPrefix}-allow-decimal-qty`;
    const baseUnitId = `${idPrefix}-base-unit`;
    const sellingUnitsId = `${idPrefix}-has-selling-units`;
    const variationsId = `${idPrefix}-has-variations`;

    return (
        <>
            <div className="grid gap-2">
                <Label htmlFor={itemTypeId}>Item Type</Label>
                <Select value={itemType} onValueChange={onItemTypeChange}>
                    <SelectTrigger id={itemTypeId}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="stock">Stock item</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                        <SelectItem value="prepared">Prepared item</SelectItem>
                        <SelectItem value="non_stock">Non-stock item</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id={decimalId}
                    checked={allowDecimalQty}
                    onChange={(event) => onAllowDecimalQtyChange(event.target.checked)}
                />
                <Label htmlFor={decimalId}>Allow decimal quantity (points, e.g. 0.5)</Label>
            </div>

            <div className="grid gap-2">
                <Label htmlFor={baseUnitId}>Base Unit</Label>
                <Input
                    id={baseUnitId}
                    value={baseUnit}
                    onChange={(event) => onBaseUnitChange(event.target.value)}
                    placeholder="piece, kg, liter"
                />
                <p className="text-xs text-gray-500">Unit for inventory tracking</p>
            </div>

            <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-2">
                    <input
                        type="checkbox"
                        id={sellingUnitsId}
                        checked={hasSellingUnits}
                        onChange={(event) => onHasSellingUnitsChange(event.target.checked)}
                    />
                    <Label htmlFor={sellingUnitsId}>Additional selling units (dozen, pack, etc.)</Label>
                </div>

                {hasSellingUnits && (
                    <div className="grid gap-2">
                        <Label>Additional Selling Units</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Unit (dozen)"
                                value={newUnit.unit}
                                onChange={(event) => onNewUnitChange((previous) => ({ ...previous, unit: event.target.value }))}
                                className="flex-1"
                            />
                            <Input
                                placeholder="Conv (12)"
                                type="number"
                                step="any"
                                value={newUnit.conversion}
                                onChange={(event) => onNewUnitChange((previous) => ({ ...previous, conversion: event.target.value }))}
                                className="w-24"
                            />
                            <Input
                                placeholder="Price"
                                type="number"
                                step="0.01"
                                value={newUnit.price}
                                onChange={(event) => onNewUnitChange((previous) => ({ ...previous, price: event.target.value }))}
                                className="w-24"
                            />
                            <Button type="button" size="sm" onClick={onAddSellingUnit} aria-label="Add selling unit">
                                +
                            </Button>
                        </div>
                        {newUnitPriceWords && (
                            <p className="text-xs text-blue-600 font-medium">{newUnitPriceWords}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {sellingUnits.map((unit, index) => (
                                <Badge key={`${unit.unit}-${index}`} variant="secondary" className="gap-2">
                                    {unit.unit} (×{unit.conversion}) rs {unit.price}
                                    <button
                                        type="button"
                                        aria-label={`Remove ${unit.unit} selling unit`}
                                        onClick={() => onRemoveSellingUnit(index)}
                                    >
                                        ×
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-2">
                    <input
                        type="checkbox"
                        id={variationsId}
                        checked={hasVariations}
                        onChange={(event) => onHasVariationsChange(event.target.checked)}
                    />
                    <Label htmlFor={variationsId}>This product has variations (Size, Color, etc.)</Label>
                </div>

                {hasVariations && (
                    <div className="grid gap-2 mt-2">
                        <Label>Variation Attributes</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g. Size, Color, Material"
                                value={newAttribute}
                                onChange={(event) => onNewAttributeChange(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        onAddAttribute();
                                    }
                                }}
                            />
                            <Button type="button" size="sm" onClick={onAddAttribute}>Add</Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {variationAttributes.map((attribute) => (
                                <Badge key={attribute} variant="secondary" className="gap-2">
                                    {attribute}
                                    <button
                                        type="button"
                                        aria-label={`Remove ${attribute} variation attribute`}
                                        onClick={() => onRemoveAttribute(attribute)}
                                    >
                                        ×
                                    </button>
                                </Badge>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500">{variationHelpText}</p>
                    </div>
                )}
            </div>
        </>
    );
}