// Store/Business Configuration for Invoices
// Update this file with your business information

export interface StoreInfo {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  taxId?: string;
  website?: string;
}

export const storeConfig: StoreInfo = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || "MyStore",
  address: process.env.NEXT_PUBLIC_STORE_ADDRESS || "Gulberg Islamabad",
  city: process.env.NEXT_PUBLIC_STORE_CITY || "",
  phone: process.env.NEXT_PUBLIC_STORE_PHONE || "",
  email: process.env.NEXT_PUBLIC_STORE_EMAIL || "",
  taxId: process.env.NEXT_PUBLIC_STORE_TAX_ID || "",
  website: process.env.NEXT_PUBLIC_STORE_WEBSITE || "vibeexe.com"
};
