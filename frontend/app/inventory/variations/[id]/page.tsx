'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import type { CatalogItemType } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Grid3x3, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface SellingUnit {
    unit: string;
    conversion: number;
    price: number;
}

interface ProductVariation {
    id: number;
    product_id: number;
    attributes: Record<string, string>;
    sku: string | null;
    price_adjustment: number;
    quantity: number;
    barcode: string | null;
}

interface Product {
    id: number;
    name: string;
    item_type?: CatalogItemType;
    sku: string | null;
    category: string;
    selling_price: number;
    cost_price: number;
    quantity: number;
    has_variations: boolean;
    variation_attributes: string[];
    base_unit: string;
    selling_units: SellingUnit[];
    variations?: ProductVariation[];
}

export default function ManageVariationsPage() {
    const router = useRouter();
    const params = useParams();
    const { token } = useAuthStore();
    const productId = params.id as string;

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [variationValues, setVariationValues] = useState<Record<string, string[]>>({});
    const [generatedVariations, setGeneratedVariations] = useState<any[]>([]);

    useEffect(() => {
        if (!token) {
            router.push('/login');
            return;
        }
        fetchProduct();
    }, [token, productId]);

    const fetchProduct = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/products/${productId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setProduct(response.data);
            
            // Fetch existing variations
            const variationsResponse = await api.get(`/products/${productId}/variations`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (variationsResponse.data.length > 0) {
                // Load existing variations into the editor
                const variations = variationsResponse.data.map((v: ProductVariation) => ({
                    id: v.id,
                    attributes: v.attributes,
                    sku: v.sku || '',
                    price_adjustment: v.price_adjustment,
                    quantity: v.quantity,
                    barcode: v.barcode || '',
                }));
                setGeneratedVariations(variations);
                
                // Extract variation values from existing variations
                const values: Record<string, Set<string>> = {};
                variationsResponse.data.forEach((v: ProductVariation) => {
                    Object.entries(v.attributes).forEach(([key, value]) => {
                        if (!values[key]) values[key] = new Set();
                        values[key].add(value as string);
                    });
                });
                const valuesObj: Record<string, string[]> = {};
                Object.entries(values).forEach(([key, valueSet]) => {
                    valuesObj[key] = Array.from(valueSet);
                });
                setVariationValues(valuesObj);
            }
        } catch (error) {
            console.error('Failed to fetch product:', error);
        } finally {
            setLoading(false);
        }
    };

    const addVariationValue = (attribute: string, value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        
        setVariationValues(prev => ({
            ...prev,
            [attribute]: [...(prev[attribute] || []), trimmed]
        }));
    };

    const removeVariationValue = (attribute: string, value: string) => {
        setVariationValues(prev => ({
            ...prev,
            [attribute]: (prev[attribute] || []).filter(v => v !== value)
        }));
    };

    const generateAllCombinations = () => {
        if (!product) return;
        
        const attributes = product.variation_attributes;
        const values = attributes.map(attr => variationValues[attr] || []);
        
        // Check if all attributes have values
        if (values.some(v => v.length === 0)) {
            alert('Please add values for all attributes before generating combinations.');
            return;
        }
        
        // Generate cartesian product
        const combinations: any[] = [];
        const generate = (current: Record<string, string>, depth: number) => {
            if (depth === attributes.length) {
                combinations.push({
                    attributes: { ...current },
                    sku: '',
                    price_adjustment: 0,
                    quantity: 0,
                    barcode: ''
                });
                return;
            }
            
            const attr = attributes[depth];
            const vals = values[depth];
            
            for (const val of vals) {
                generate({ ...current, [attr]: val }, depth + 1);
            }
        };
        
        generate({}, 0);
        setGeneratedVariations(combinations);
    };

    const updateVariation = (index: number, field: string, value: string) => {
        setGeneratedVariations(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: field === 'price_adjustment' || field === 'quantity' ? parseFloat(value) || 0 : value };
            return updated;
        });
    };

    const saveVariations = async () => {
        if (!product || generatedVariations.length === 0) return;
        
        try {
            setSaving(true);
            
            // Delete existing variations
            if (product.variations && product.variations.length > 0) {
                for (const variation of product.variations) {
                    await api.delete(`/products/variations/${variation.id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                }
            }
            
            // Create new variations
            for (const variation of generatedVariations) {
                await api.post(`/products/${product.id}/variations`, {
                    attributes: variation.attributes,
                    sku: variation.sku || null,
                    price_adjustment: variation.price_adjustment,
                    quantity: variation.quantity,
                    barcode: variation.barcode || null,
                }, {
                    headers: { Authorization: `Bearer ${token}` },
                });
            }
            
            alert('Variations saved successfully!');
            router.push('/inventory');
        } catch (error: any) {
            console.error('Failed to save variations:', error);
            alert(error.response?.data?.detail || 'Failed to save variations');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-lg text-red-600">Product not found</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-[1600px] h-full overflow-y-auto">
            {/* Breadcrumb */}
            <Breadcrumb className="mb-6">
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/inventory">Inventory</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>Manage Variations</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => router.push('/inventory')}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">Manage Product Variations</h1>
                        <p className="text-muted-foreground mt-1">{product.name} - Define specific variation options and their stock/pricing</p>
                    </div>
                </div>
                <Button 
                    onClick={saveVariations} 
                    disabled={generatedVariations.length === 0 || saving}
                    size="lg"
                >
                    <Save className="mr-2 h-5 w-5" />
                    {saving ? 'Saving...' : 'Save All Variations'}
                </Button>
            </div>

            {/* Step 1: Define Values for Each Attribute */}
            <div className="border rounded-lg p-6 bg-slate-50 mb-6">
                <h2 className="text-xl font-semibold mb-4">Step 1: Define Variation Values</h2>
                <div className="space-y-5">
                    {product.variation_attributes.map(attr => (
                        <div key={attr} className="space-y-2">
                            <Label className="text-base font-medium">{attr}</Label>
                            <Input 
                                placeholder={`e.g. ${attr === 'Size' ? 'S, M, L, XL' : attr === 'Color' ? 'Red, Blue, Green' : 'Value'}`}
                                className="text-base"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addVariationValue(attr, e.currentTarget.value);
                                        e.currentTarget.value = '';
                                    }
                                }}
                            />
                            <div className="flex flex-wrap gap-2 min-h-[36px]">
                                {variationValues[attr]?.map(value => (
                                    <Badge key={value} variant="secondary" className="text-sm px-3 py-1.5">
                                        {value}
                                        <button 
                                            type="button" 
                                            onClick={() => removeVariationValue(attr, value)}
                                            className="ml-2 hover:text-red-600 font-bold"
                                        >
                                            ×
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <Button onClick={generateAllCombinations} className="mt-6" size="lg">
                    <Grid3x3 className="mr-2 h-5 w-5" />
                    Generate All Combinations
                </Button>
            </div>

            {/* Step 2: Configure Each Variation */}
            {generatedVariations.length > 0 && (
                <div className="border rounded-lg p-6 bg-white">
                    <h2 className="text-xl font-semibold mb-4">
                        Step 2: Configure Variations 
                        <span className="text-muted-foreground ml-2">({generatedVariations.length} items)</span>
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">
                        Leave barcode blank to auto-generate: main product barcode + 2 random digits.
                    </p>
                    
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 mb-3 pb-3 border-b font-semibold text-sm bg-slate-50 p-4 rounded-t-lg">
                        <div className="col-span-3">Variation</div>
                        <div className="col-span-2">SKU</div>
                        <div className="col-span-2">Price Adjustment (rs)</div>
                        <div className="col-span-2">Stock Quantity</div>
                        <div className="col-span-3">Barcode</div>
                    </div>
                    
                    {/* Table Rows */}
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                        {generatedVariations.map((variation, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-4 items-center p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border">
                                <div className="col-span-3">
                                    <div className="font-medium text-sm space-y-1">
                                        {Object.entries(variation.attributes).map(([k, v]) => (
                                            <div key={k} className="text-slate-700">
                                                <span className="text-slate-500 font-normal">{k}:</span> <span className="font-semibold">{String(v)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <Input 
                                        placeholder="TSH0..."
                                        value={variation.sku}
                                        onChange={e => updateVariation(idx, 'sku', e.target.value)}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Input 
                                        placeholder="0.00"
                                        type="number"
                                        step="0.01"
                                        value={variation.price_adjustment}
                                        onChange={e => updateVariation(idx, 'price_adjustment', e.target.value)}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Input 
                                        placeholder="0"
                                        type="number"
                                        value={variation.quantity}
                                        onChange={e => updateVariation(idx, 'quantity', e.target.value)}
                                    />
                                </div>
                                <div className="col-span-3">
                                    <Input 
                                        placeholder="Leave blank for auto barcode"
                                        value={variation.barcode}
                                        onChange={e => updateVariation(idx, 'barcode', e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
