// Store/Business Configuration for Invoices
// The canonical values are stored in the backend DB.
// Use fetchStoreConfig() to load them at runtime.

import api, { InvoiceDesign, InvoiceFormat } from "@/lib/api";

export interface StoreInfo {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  taxId?: string;
  website?: string;
  logoUrl?: string | null;
  defaultPrintFormat: InvoiceFormat;
  defaultWhatsAppFormat: InvoiceFormat;
  defaultPrintDesign: InvoiceDesign;
  defaultWhatsAppDesign: InvoiceDesign;
  showTaxId: boolean;
  showCashier: boolean;
  showSku: boolean;
  showCustomerBalance: boolean;
  footerMessage: string;
  terms: string;
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
  logoUrl: null,
  defaultPrintFormat: "compact",
  defaultWhatsAppFormat: "mobile",
  defaultPrintDesign: "classic",
  defaultWhatsAppDesign: "modern",
  showTaxId: true,
  showCashier: true,
  showSku: false,
  showCustomerBalance: true,
  footerMessage: "Thank you for your business!",
  terms: "Return and exchange accepted with invoice.",
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
      logoUrl: d.logo_url ? `/api/v1${d.logo_url}` : null,
      defaultPrintFormat: d.default_print_format || storeConfig.defaultPrintFormat,
      defaultWhatsAppFormat: d.default_whatsapp_format || storeConfig.defaultWhatsAppFormat,
      defaultPrintDesign: d.default_print_design || storeConfig.defaultPrintDesign,
      defaultWhatsAppDesign: d.default_whatsapp_design || storeConfig.defaultWhatsAppDesign,
      showTaxId: d.invoice_show_tax_id ?? storeConfig.showTaxId,
      showCashier: d.invoice_show_cashier ?? storeConfig.showCashier,
      showSku: d.invoice_show_sku ?? storeConfig.showSku,
      showCustomerBalance: d.invoice_show_customer_balance ?? storeConfig.showCustomerBalance,
      footerMessage: d.invoice_footer_message ?? storeConfig.footerMessage,
      terms: d.invoice_terms ?? storeConfig.terms,
    };
  } catch {
    return storeConfig;
  }
}
