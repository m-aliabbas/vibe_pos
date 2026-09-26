import axios from 'axios';

const getBaseURL = () => {
    if (typeof window !== 'undefined') {
        // Keep browser requests on the frontend origin. Next.js proxies these
        // requests to the backend running on the host machine, so LAN clients
        // do not need direct access to the backend port.
        return '/api/v1';
    }
    return 'http://127.0.0.1:8000/api/v1';
};

const api = axios.create({
    baseURL: getBaseURL(),
});

api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = sessionStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

export default api;

export type ApplicationId = 'retail' | 'workshop' | 'restaurant';
export type ProfileId = 'retail' | 'clothing-retail' | 'milk-counter-retail';
export type ModuleId = 'workshop' | 'restaurant' | 'clothing' | 'milk';
export type CatalogItemType = 'stock' | 'service' | 'prepared' | 'non_stock';
export type CapabilityId =
    | 'platform.authentication'
    | 'platform.users'
    | 'platform.store-configuration'
    | 'shared.customer-identity'
    | 'shared.payments'
    | 'shared.invoices'
    | 'shared.printing'
    | 'shared.reporting'
    | 'shared.permissions'
    | 'shared.audit'
    | 'retail.catalog'
    | 'retail.inventory'
    | 'retail.purchasing'
    | 'retail.sales'
    | 'retail.returns'
    | 'retail.accounting'
    | 'retail.holds'
    | 'infrastructure.backup'
    | 'infrastructure.files'
    | 'infrastructure.messaging'
    | 'workshop.jobs'
    | 'restaurant.orders';

export interface AppBranding {
    name: string;
    address: string;
    phone: string;
    email: string;
    city: string;
    tax_id: string;
    website: string;
}

export interface AppConfigResponse {
    application_id: ApplicationId;
    application_name: string;
    application_version: string;
    schema_version: string;
    profile_id: ProfileId;
    enabled_modules: ModuleId[];
    enabled_capabilities: CapabilityId[];
    shared_package_versions: Record<string, string>;
    branding: AppBranding;
}

export const appConfigApi = {
    get: async (): Promise<AppConfigResponse> => {
        const response = await api.get('/app-config');
        return response.data;
    },
    changeProfile: async (profileId: ProfileId): Promise<AppConfigResponse> => {
        const response = await api.put('/app-config/profile', { profile_id: profileId });
        return response.data;
    },
};

// ============ CUSTOMER API FUNCTIONS ============

export interface CustomerSimple {
    id: number;
    customer_id?: string;
    phone?: string;
    name?: string;
    outstanding_balance: number;
    credit_limit?: number | null;
}

export interface CustomerResponse {
    id: number;
    customer_id?: string;
    phone?: string;
    email?: string;
    name?: string;
    address?: string;
    total_purchases: number;
    total_spent: number;
    outstanding_balance: number;
    opening_balance: number;
    current_mileage?: number;
    oil_change_interval?: number;
    next_oil_change_mileage?: number;
    member_since: string;
    created_at: string;
    updated_at: string;
    notes: CustomerNote[];
    payments: CustomerPayment[];
    credit_limit?: number | null;
}

export interface CustomerCreate {
    phone?: string;
    customer_id?: string;
    email?: string;
    name?: string;
    address?: string;
    current_mileage?: number;
    oil_change_interval?: number;
    next_oil_change_mileage?: number;
    opening_balance?: number;
    credit_limit?: number | null;
}

export interface CustomerUpdate {
    phone?: string;
    customer_id?: string;
    current_mileage?: number;
    oil_change_interval?: number;
    next_oil_change_mileage?: number;
    email?: string;
    name?: string;
    address?: string;
    opening_balance?: number;
    credit_limit?: number | null;
}

export interface CustomerListResponse {
    id: number;
    customer_id?: string;
    phone?: string;
    name?: string;
    total_purchases: number;
    total_spent: number;
    outstanding_balance: number;
    credit_limit?: number | null;
    current_mileage?: number;
    next_oil_change_mileage?: number;
    created_at: string;
}

export interface CustomerNote {
    id: number;
    customer_id: number;
    note_type: string;
    note_text: string;
    created_at: string;
    updated_at: string;
    amount?: number | null;
    payment_method?: string | null;
}

export interface CustomerNoteCreate {
    note_type?: string;
    note_text: string;
}

export interface CustomerPayment {
    id: number;
    customer_id: number;
    amount: number;
    payment_method: string;
    payment_date: string;
    reference_note?: string;
    created_at: string;
}

export interface CustomerPaymentCreate {
    amount: number;
    payment_method?: string;
    reference_note?: string;
}

export interface LedgerEntry {
    date: string;
    description: string;
    source_type?: string;
    source_id?: number;
    debit: number;
    credit: number;
    balance: number;
}

export interface LedgerReport {
    opening_balance: number;
    closing_balance: number;
    entries: LedgerEntry[];
}

export interface HoldSalePayload {
    cart: Array<{
        product_id: number;
        variation_id?: number | null;
        unit: string;
        quantity: number;
        item_discount?: number;
        unit_price?: number;
    }>;
    customerId: string;
    customerPhone: string;
    customerName: string;
    selectedCustomer: CustomerSimple | null;
    paymentMethod: string;
    discount: number;
    tax: number;
    deliveryCharges: number;
    amountPaid: string;
}

export interface HoldSaleResponse {
    id: number;
    user_id: number;
    label?: string;
    payload: HoldSalePayload;
    created_at: string;
    updated_at?: string;
}

export interface HoldPurchasePayload {
    vendorId: string;
    vendorSearch: string;
    amountPaid: string;
    items: Array<{
        product_id: number;
        product_name: string;
        product_sku?: string | null;
        quantity: number;
        unit_cost: number;
        total_cost: number;
        expiry_date?: string | null;
        selling_price?: number | null;
        update_selling_price?: boolean;
    }>;
}

export interface HoldPurchaseResponse {
    id: number;
    user_id: number;
    label?: string;
    payload: HoldPurchasePayload;
    created_at: string;
    updated_at?: string;
}

// Customer API functions
export const customerApi = {
    // List customers with optional search
    getCustomers: async (params?: {
        skip?: number;
        limit?: number;
        search?: string;
    }): Promise<CustomerListResponse[]> => {
        const response = await api.get('/customers/', { params });
        return response.data;
    },

    // Count customers with optional search
    countCustomers: async (params?: {
        search?: string;
    }): Promise<{ total: number }> => {
        const response = await api.get('/customers/count', { params });
        return response.data;
    },

    // Search for customer by phone or customer_id
    searchCustomer: async (params: {
        phone?: string;
        customer_id?: string;
    }): Promise<CustomerSimple | null> => {
        try {
            const response = await api.get('/customers/search', { params });
            return response.data;
        } catch (error: any) {
            if (error.response?.status === 404) {
                return null; // Customer not found
            }
            throw error;
        }
    },

    // Create new customer
    createCustomer: async (customer: CustomerCreate): Promise<CustomerResponse> => {
        const response = await api.post('/customers/', customer);
        return response.data;
    },

    // Bulk import customers via CSV
    bulkImportCustomers: async (formData: FormData): Promise<{ created: number; skipped: number; errors: string[] }> => {
        const response = await api.post('/customers/bulk-import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    // Find existing customer or create new one (used during checkout)
    findOrCreateCustomer: async (customer: CustomerCreate): Promise<CustomerSimple> => {
        const response = await api.post('/customers/find-or-create', customer);
        return response.data;
    },

    // Get customer by ID
    getCustomer: async (id: number): Promise<CustomerResponse> => {
        const response = await api.get(`/customers/${id}`);
        return response.data;
    },

    // Update customer
    updateCustomer: async (id: number, customer: CustomerUpdate): Promise<CustomerResponse> => {
        const response = await api.put(`/customers/${id}`, customer);
        return response.data;
    },

    // Delete customer (admin only)
    deleteCustomer: async (id: number): Promise<void> => {
        await api.delete(`/customers/${id}`);
    },

    // Get customer notes
    getCustomerNotes: async (id: number): Promise<CustomerNote[]> => {
        const response = await api.get(`/customers/${id}/notes`);
        return response.data;
    },

    // Add customer note
    addCustomerNote: async (id: number, note: CustomerNoteCreate): Promise<CustomerNote> => {
        const response = await api.post(`/customers/${id}/notes`, note);
        return response.data;
    },

    // Delete customer note
    deleteCustomerNote: async (id: number, noteId: number): Promise<void> => {
        await api.delete(`/customers/${id}/notes/${noteId}`);
    },

    // Get customer payments
    getCustomerPayments: async (id: number): Promise<CustomerPayment[]> => {
        const response = await api.get(`/customers/${id}/payments`);
        return response.data;
    },

    // Record payment against customer's outstanding balance
    recordCustomerPayment: async (id: number, payment: CustomerPaymentCreate): Promise<CustomerPayment> => {
        const response = await api.post(`/customers/${id}/record-payment`, payment);
        return response.data;
    },

    // Update an existing customer payment
    updateCustomerPayment: async (id: number, paymentId: number, payment: CustomerPaymentCreate): Promise<CustomerPayment> => {
        const response = await api.put(`/customers/${id}/payments/${paymentId}`, payment);
        return response.data;
    },

    // Delete a customer payment
    deleteCustomerPayment: async (id: number, paymentId: number): Promise<void> => {
        await api.delete(`/customers/${id}/payments/${paymentId}`);
    },

    // Add advance payment (buy on behalf of customer)
    addCustomerAdvance: async (id: number, advance: {
        amount: number;
        description: string;
        payment_method?: string;
    }): Promise<any> => {
        const response = await api.post(`/customers/${id}/add-advance`, advance);
        return response.data;
    },

    updateCustomerAdvance: async (id: number, advanceId: number, advance: {
        amount: number;
        description: string;
        payment_method?: string;
    }): Promise<CustomerNote> => {
        const response = await api.put(`/customers/${id}/advances/${advanceId}`, advance);
        return response.data;
    },

    deleteCustomerAdvance: async (id: number, advanceId: number): Promise<void> => {
        await api.delete(`/customers/${id}/advances/${advanceId}`);
    },

    // Customer ledger
    getCustomerLedger: async (id: number, params?: { start_date?: string; end_date?: string }): Promise<LedgerReport> => {
        const response = await api.get(`/reports/customers/${id}/ledger`, { params });
        return response.data;
    },
    exportCustomerLedger: async (id: number, params?: { start_date?: string; end_date?: string }): Promise<Blob> => {
        const response = await api.get(`/reports/customers/${id}/ledger`, {
            params: { ...params, export: true },
            responseType: 'blob',
        });
        return response.data;
    },

    // Send due reminder
    sendCustomerReminder: async (id: number): Promise<{ success: boolean; message?: string }> => {
        const response = await api.post(`/customers/${id}/send-reminder`);
        return response.data;
    },

    // Backfill ledger links
    backfillCustomerLedger: async (id: number): Promise<{ success: boolean; updated_sales: number; updated_journal_lines: number }> => {
        const response = await api.post(`/customers/${id}/ledger/backfill`);
        return response.data;
    },

    // Export customer report
    exportCustomerReport: async (id: number): Promise<Blob> => {
        const response = await api.get(`/customers/${id}/report`, {
            responseType: 'blob',
        });
        return response.data;
    },

    // Export all customers CSV
    exportCustomersCsv: async (): Promise<Blob> => {
        const response = await api.get('/customers/export-csv', {
            responseType: 'blob',
        });
        return response.data;
    },

    // Send reminders to all due customers
    sendAllDueReminders: async (): Promise<{ success: boolean; sent: number; skipped: number }> => {
        const response = await api.post('/customers/send-reminders');
        return response.data;
    },
    // Get customer purchase history
    getCustomerPurchases: async (id: number, params?: {
        skip?: number;
        limit?: number;
    }): Promise<{
        customer_id: number;
        customer_name?: string;
        total_count: number;
        purchases: Array<{
            id: number;
            total: number;
            amount_paid: number;
            amount_due: number;
            payment_method: string;
            created_at: string;
            items_count: number;
        }>;
    }> => {
        const response = await api.get(`/customers/${id}/purchases`, { params });
        return response.data;
    },

    // Get customer financial summary
    getCustomerFinancialSummary: async (id: number): Promise<{
        customer_id: number;
        customer_name?: string;
        total_purchases: number;
        total_spent: number;
        outstanding_balance: number;
        average_purchase_value: number;
        total_payments_made: number;
        total_payment_amount: number;
        member_since: string;
    }> => {
        const response = await api.get(`/customers/${id}/financial-summary`);
        return response.data;
    },
};

// ============ HOLD SALES API FUNCTIONS ============

export const holdSalesApi = {
    list: async (): Promise<HoldSaleResponse[]> => {
        const response = await api.get('/hold-sales/');
        return response.data;
    },
    create: async (payload: { label?: string; payload: HoldSalePayload }): Promise<HoldSaleResponse> => {
        const response = await api.post('/hold-sales/', payload);
        return response.data;
    },
    delete: async (id: number): Promise<void> => {
        await api.delete(`/hold-sales/${id}`);
    },
};

export const holdPurchasesApi = {
    list: async (): Promise<HoldPurchaseResponse[]> => {
        const response = await api.get('/hold-purchases/');
        return response.data;
    },
    create: async (payload: { label?: string; payload: HoldPurchasePayload }): Promise<HoldPurchaseResponse> => {
        const response = await api.post('/hold-purchases/', payload);
        return response.data;
    },
    delete: async (id: number): Promise<void> => {
        await api.delete(`/hold-purchases/${id}`);
    },
};

// ============ SALES API FUNCTIONS ============

export const salesApi = {
    getSale: async (id: number): Promise<any> => {
        const response = await api.get(`/sales/${id}`);
        return response.data;
    },
};

// ============ PURCHASES API FUNCTIONS ============

export const purchasesApi = {
    getPurchase: async (id: number): Promise<any> => {
        const response = await api.get(`/purchases/${id}`);
        return response.data;
    },
};

export interface ProductSalesHistoryItem {
    product_id: number;
    product_name: string;
    sku?: string | null;
    base_unit: string;
    purchased_quantity: number;
    sold_quantity: number;
    purchase_cost: number;
    sales_revenue: number;
    cost_of_goods_sold: number;
    profit_loss: number;
    purchase_orders: number;
    sales_transactions: number;
}

export interface ProductSalesHistoryReport {
    products: ProductSalesHistoryItem[];
    summary: {
        matched_products: number;
        purchased_quantity: number;
        sold_quantity: number;
        purchase_cost: number;
        sales_revenue: number;
        cost_of_goods_sold: number;
        profit_loss: number;
    };
    search: string;
    period_start: string;
    period_end: string;
}

export interface AnalyticsStockItem {
    product_id: number;
    product_name: string;
    sku?: string | null;
    category?: string | null;
    current_stock: number;
    threshold: number;
    base_unit: string;
}

export interface AnalyticsProductSale {
    product_id: number;
    product_name: string;
    sku?: string | null;
    quantity_sold: number;
    revenue: number;
}

export interface AnalyticsCustomer {
    customer_id: number;
    customer_name: string;
    phone?: string | null;
    transaction_count: number;
    total_bought: number;
    outstanding_amount: number;
}

export interface AnalyticsOverviewReport {
    period_start: string;
    period_end: string;
    top_n: number;
    months: number;
    low_stock: AnalyticsStockItem[];
    out_of_stock: AnalyticsStockItem[];
    most_selling: AnalyticsProductSale[];
    least_selling: AnalyticsProductSale[];
    monthly_sales: Array<{ month: string; quantity_sold: number; revenue: number }>;
    top_vendors: Array<{
        vendor_id: number;
        vendor_name: string;
        purchase_count: number;
        total_bought: number;
    }>;
    vendor_price_comparisons: Array<{
        product_id: number;
        product_name: string;
        sku?: string | null;
        lowest_price: number;
        highest_price: number;
        price_difference: number;
        vendors: Array<{
            vendor_id: number;
            vendor_name: string;
            quantity_bought: number;
            average_unit_cost: number;
        }>;
    }>;
    outstanding_vendors: Array<{
        vendor_id: number;
        vendor_name: string;
        phone?: string | null;
        outstanding_amount: number;
    }>;
    outstanding_customers: AnalyticsCustomer[];
    top_customers: AnalyticsCustomer[];
}

export const reportsApi = {
    getAnalyticsOverview: async (params: {
        start_date?: string;
        end_date?: string;
        top_n?: number;
        months?: number;
    }): Promise<AnalyticsOverviewReport> => {
        const response = await api.get('/reports/analytics/overview', { params });
        return response.data;
    },
    getProductSalesHistory: async (params: {
        start_date?: string;
        end_date?: string;
        search?: string;
    }): Promise<ProductSalesHistoryReport> => {
        const response = await api.get('/reports/sales/product-history', { params });
        return response.data;
    },
    exportProductSalesHistory: async (params: {
        start_date?: string;
        end_date?: string;
        search?: string;
    }): Promise<Blob> => {
        const response = await api.get('/reports/sales/product-history', {
            params: { ...params, export: true },
            responseType: 'blob',
        });
        return response.data;
    },
    getVendorLedger: async (id: number, params?: { start_date?: string; end_date?: string }): Promise<LedgerReport> => {
        const response = await api.get(`/reports/vendors/${id}/ledger`, { params });
        return response.data;
    },
    exportVendorLedger: async (id: number, params?: { start_date?: string; end_date?: string }): Promise<Blob> => {
        const response = await api.get(`/reports/vendors/${id}/ledger`, {
            params: { ...params, export: true },
            responseType: 'blob',
        });
        return response.data;
    },
};

export const vendorReportsApi = {
    exportVendorReport: async (id: number): Promise<Blob> => {
        const response = await api.get(`/vendors/${id}/report`, {
            responseType: 'blob',
        });
        return response.data;
    },
};

export interface VendorPaymentRecord {
    id: number;
    amount: number;
    date: string | null;
    reference_note: string;
    description: string;
}

export const vendorPaymentsApi = {
    getVendorPayments: async (id: number): Promise<VendorPaymentRecord[]> => {
        const response = await api.get(`/vendors/${id}/payments`);
        return response.data;
    },
    updateVendorPayment: async (id: number, entryId: number, note: string): Promise<VendorPaymentRecord> => {
        const response = await api.put(`/vendors/${id}/payments/${entryId}`, { amount: 0, reference_note: note });
        return response.data;
    },
    deleteVendorPayment: async (id: number, entryId: number): Promise<void> => {
        await api.delete(`/vendors/${id}/payments/${entryId}`);
    },
};

// ============ STOCK AUDIT API ============

export interface StockBatch {
    id: number;
    product_id: number;
    variation_id?: number | null;
    purchase_item_id?: number | null;
    batch_number: string;
    quantity_received: number;
    quantity_remaining: number;
    unit_cost: number;
    selling_price: number;
    purchase_date: string;
    expiry_date?: string | null;
    status: 'active' | 'depleted' | 'merged';
    merged_into_id?: number | null;
    notes?: string | null;
    created_at: string;
    product_name?: string | null;
}

export interface BatchSummaryByProduct {
    product_id: number;
    product_name: string;
    total_qty: number;
    active_batches: number;
    avg_cost: number;
    total_value: number;
    batches: StockBatch[];
}

export interface InventorySummary {
    total_inventory_value: number;
    total_active_batches: number;
    total_depleted_batches: number;
    products_with_multiple_batches: number;
}

export interface CostingComparison {
    product_id: number;
    product_name: string;
    fifo_cogs: number;
    lifo_cogs: number;
    wac_cogs: number;
    units_sold: number;
}

export interface MergeRequest {
    batch_ids: number[];
    merge_method: 'weighted_avg' | 'use_latest' | 'use_lowest';
    new_selling_price?: number;
    notes?: string;
}

export interface MergeResult {
    new_batch: StockBatch;
    merged_count: number;
    total_qty: number;
    computed_cost: number;
}

export const stockAuditApi = {
    listBatches: async (params?: { product_id?: number; status?: string; skip?: number; limit?: number }): Promise<StockBatch[]> => {
        const response = await api.get('/stock-audit/batches', { params });
        return response.data;
    },
    getProductBatches: async (productId: number): Promise<BatchSummaryByProduct> => {
        const response = await api.get(`/stock-audit/batches/product/${productId}`);
        return response.data;
    },
    updateBatch: async (batchId: number, data: { selling_price?: number; notes?: string }): Promise<StockBatch> => {
        const response = await api.patch(`/stock-audit/batches/${batchId}`, data);
        return response.data;
    },
    mergeBatches: async (payload: MergeRequest): Promise<MergeResult> => {
        const response = await api.post('/stock-audit/merge', payload);
        return response.data;
    },
    getSummary: async (): Promise<InventorySummary> => {
        const response = await api.get('/stock-audit/summary');
        return response.data;
    },
    getCostingComparison: async (params?: { date_from?: string; date_to?: string }): Promise<CostingComparison[]> => {
        const response = await api.get('/stock-audit/costing-comparison', { params });
        return response.data;
    },
};
