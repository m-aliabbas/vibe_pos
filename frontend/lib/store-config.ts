// Store/Business Configuration for Invoices
// The canonical values are stored in the backend DB.
// Use fetchStoreConfig() to load them at runtime.

import api from "@/lib/api";

export interface StoreInfo {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  taxId?: string;
  website?: string;
}

/** Fallback used when the API is unreachable. */
export const storeConfig: StoreInfo = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || "My Store",
  address: process.env.NEXT_PUBLIC_STORE_ADDRESS || "",
  city: process.env.NEXT_PUBLIC_STORE_CITY || "",
  phone: process.env.NEXT_PUBLIC_STORE_PHONE || "",
  email: process.env.NEXT_PUBLIC_STORE_EMAIL || "",
  taxId: process.env.NEXT_PUBLIC_STORE_TAX_ID || "",
  website: process.env.NEXT_PUBLIC_STORE_WEBSITE || "",
};

/** Fetch live store settings from the backend. */
export async function fetchStoreConfig(): Promise<StoreInfo> {
  try {
    const res = await api.get("/settings/store");
    const d = res.data;
    return {
      name: d.store_name || storeConfig.name,
      address: d.store_address || storeConfig.address,
      city: d.store_city || storeConfig.city,
      phone: d.store_phone || storeConfig.phone,
      email: d.store_email || storeConfig.email,
      taxId: d.store_tax_id || storeConfig.taxId,
      website: d.store_website || storeConfig.website,
    };
  } catch {
    return storeConfig;
  }
}
