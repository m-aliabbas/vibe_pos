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
  name: "My Store POS",
  address: "123 Main Street",
  city: "City, State 12345",
  phone: "(555) 123-4567",
  email: "info@mystore.com",
  taxId: "TAX-123456",
  website: "www.mystore.com"
};
