'use client';

import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

export type ModuleUiSlot =
    | 'retail.pos.after-product-search'
    | 'retail.pos.cart-summary'
    | 'retail.inventory.catalog-fields'
    | 'shared.customer.profile-fields';

export type ModuleUiContributionRegistry = Partial<
    Record<ModuleUiSlot, readonly ComponentType[]>
>;

const ModuleUiContext = createContext<ModuleUiContributionRegistry>({});

export function ModuleUiContributionProvider({
    contributions,
    children,
}: {
    contributions: ModuleUiContributionRegistry;
    children: ReactNode;
}) {
    return (
        <ModuleUiContext.Provider value={contributions}>
            {children}
        </ModuleUiContext.Provider>
    );
}

export function ModuleUiContributionSlot({ slot }: { slot: ModuleUiSlot }) {
    const registry = useContext(ModuleUiContext);
    const contributions = registry[slot] || [];

    return (
        <>
            {contributions.map((Contribution, index) => (
                <Contribution key={`${slot}-${index}`} />
            ))}
        </>
    );
}