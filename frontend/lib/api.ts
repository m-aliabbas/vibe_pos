import axios, { type AxiosProgressEvent } from 'axios';

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

export type InvoiceFormat = 'compact' | 'professional' | 'mobile';
export type InvoiceDesign = 'classic' | 'modern' | 'minimal';

export interface StoreSettings {
    id: number;
    store_name: string;
    store_address: string;
    store_city: string;
    store_phone: string;
    store_email: string;
    store_tax_id: string;
    store_website: string;
    cash_register_enabled: boolean;
    logo_url: string | null;
    default_print_format: InvoiceFormat;
    default_whatsapp_format: InvoiceFormat;
    default_print_design: InvoiceDesign;
    default_whatsapp_design: InvoiceDesign;
    invoice_show_tax_id: boolean;
    invoice_show_cashier: boolean;
    invoice_show_sku: boolean;
    invoice_show_customer_balance: boolean;
    invoice_footer_message: string;
    invoice_terms: string;
}

export type StoreSettingsUpdate = Omit<StoreSettings, 'id' | 'logo_url'>;

export interface LicenseStatus {
    enforced: boolean;
    expires_at: string | null;
    days_remaining: number | null;
}

export const storeSettingsApi = {
    get: async (): Promise<StoreSettings> => {
        const response = await api.get('/settings/store');
        return response.data;
    },
    update: async (payload: StoreSettingsUpdate): Promise<StoreSettings> => {
        const response = await api.put('/settings/store', payload);
        return response.data;
    },
    uploadLogo: async (file: File): Promise<StoreSettings> => {
        const body = new FormData();
        body.append('file', file);
        const response = await api.put('/settings/logo', body);
        return response.data;
    },
    deleteLogo: async (): Promise<StoreSettings> => {
        const response = await api.delete('/settings/logo');
        return response.data;
    },
    getLicenseStatus: async (): Promise<LicenseStatus> => {
        const response = await api.get('/settings/license-status');
        return response.data;
    },
};

export interface WhatsAppReportSettings {
    owner_number: string;
    daily_report_enabled: boolean;
    daily_report_time: string;
    last_daily_report_date: string | null;
}

export type WhatsAppReportSettingsUpdate = Omit<WhatsAppReportSettings, 'last_daily_report_date'>;

export const whatsappReportSettingsApi = {
    get: async (): Promise<WhatsAppReportSettings> => {
        const response = await api.get('/settings/whatsapp-reports');
        return response.data;
    },
    update: async (payload: WhatsAppReportSettingsUpdate): Promise<WhatsAppReportSettings> => {
        const response = await api.put('/settings/whatsapp-reports', payload);
        return response.data;
    },
};

export interface PosDatabaseFile {
    path: string;
    size: number;
    size_mb: number;
}

export interface LocalBackupFile {
    filename: string;
    size: number;
    size_mb: number;
    created: string;
}

export interface BackupCreateResult {
    success: boolean;
    message: string;
    backup_filename: string;
    drive_uploaded: boolean;
    drive_error: string | null;
}

export interface BackupRestoreResult {
    success: boolean;
    restored_file: 'pos.db';
    safety_backup: string;
}

export const backupApi = {
    listDatabaseFiles: async (): Promise<PosDatabaseFile[]> => {
        const response = await api.get('/backup/list-files');
        return response.data.files || [];
    },
    listLocal: async (): Promise<LocalBackupFile[]> => {
        const response = await api.get('/backup/list');
        return response.data.backups || [];
    },
    create: async (): Promise<BackupCreateResult> => {
        const response = await api.post('/backup/create');
        return response.data;
    },
    download: async (filename: string): Promise<Blob> => {
        const response = await api.get(`/backup/download/${encodeURIComponent(filename)}`, {
            responseType: 'blob',
        });
        return response.data;
    },
    restoreLocal: async (
        file: File,
        onUploadProgress?: (event: AxiosProgressEvent) => void,
    ): Promise<BackupRestoreResult> => {
        const body = new FormData();
        body.append('file', file);
        const response = await api.post('/backup/restore', body, {
            timeout: 60_000,
            onUploadProgress,
        });
        return response.data;
    },
};

export interface GoogleDriveAccount {
    display_name: string | null;
    email: string | null;
}

export interface GoogleDriveBackupStatus {
    configured: boolean;
    connected: boolean;
    account: GoogleDriveAccount | null;
    folder_name: string;
}

export interface GoogleDriveBackupUpload {
    success: boolean;
    message: string;
    filename: string;
    folder_name: string;
    account: GoogleDriveAccount | null;
}

export interface GoogleDriveBackupFile {
    file_id: string;
    filename: string;
    created: string | null;
    size: number;
    size_mb: number;
}

export const googleDriveBackupApi = {
    getStatus: async (): Promise<GoogleDriveBackupStatus> => {
        const response = await api.get('/backup/google-drive/status');
        return response.data;
    },
    connect: async (): Promise<GoogleDriveBackupStatus> => {
        const response = await api.post('/backup/google-drive/connect', undefined, {
            timeout: 180_000,
        });
        return response.data;
    },
    disconnect: async (): Promise<GoogleDriveBackupStatus> => {
        const response = await api.delete('/backup/google-drive/disconnect');
        return response.data;
    },
    upload: async (): Promise<GoogleDriveBackupUpload> => {
        const response = await api.post('/backup/google-drive/upload', undefined, {
            timeout: 180_000,
        });
        return response.data;
    },
    list: async (): Promise<GoogleDriveBackupFile[]> => {
        const response = await api.get('/backup/google-drive/list');
        return response.data;
    },
    restore: async (fileId: string): Promise<{ success: boolean; source_filename: string; safety_backup: string }> => {
        const response = await api.post(`/backup/google-drive/restore/${encodeURIComponent(fileId)}`, undefined, {
            timeout: 180_000,
        });
        return response.data;
    },
};

// ============ CASH REGISTER (CASH DRAWER) API FUNCTIONS ============

export interface CashRegisterSession {
    id: number;
    user_id: number;
    username?: string | null;
    opening_cash: number;
    opened_at: string;
    closing_cash?: number | null;
    expected_cash?: number | null;
    difference?: number | null;
    closed_at?: string | null;
    status: 'open' | 'closed';
    notes?: string | null;
}

export interface CashRegisterStatus {
    enabled: boolean;
    session: CashRegisterSession | null;
}

export const cashRegisterApi = {
    getStatus: async (): Promise<CashRegisterStatus> => {
        const response = await api.get('/cash-register/status');
        return response.data;
    },
    open: async (opening_cash: number): Promise<CashRegisterSession> => {
        const response = await api.post('/cash-register/open', { opening_cash });
        return response.data;
    },
    close: async (closing_cash: number, notes?: string): Promise<CashRegisterSession> => {
        const response = await api.post('/cash-register/close', { closing_cash, notes });
        return response.data;
    },
    getOpenSessions: async (): Promise<CashRegisterSession[]> => {
        const response = await api.get('/cash-register/open-sessions');
        return response.data;
    },
    getSessions: async (params?: { user_id?: number; start_date?: string; end_date?: string; limit?: number }): Promise<CashRegisterSession[]> => {
        const response = await api.get('/cash-register/sessions', { params });
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
    discount?: string;
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
        balance_status?: 'udhar' | 'credit' | 'settled';
        udhar_min?: number;
        udhar_max?: number;
        sales_status?: 'with_sales' | 'without_sales';
    }): Promise<CustomerListResponse[]> => {
        const response = await api.get('/customers/', { params });
        return response.data;
    },

    // Count customers with optional search
    countCustomers: async (params?: {
        search?: string;
        balance_status?: 'udhar' | 'credit' | 'settled';
        udhar_min?: number;
        udhar_max?: number;
        sales_status?: 'with_sales' | 'without_sales';
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
    category?: string | null;
    company?: string | null;
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

export interface ProductReportOption {
    id: number;
    name: string;
    sku?: string | null;
    category?: string | null;
    company?: string | null;
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
    product_id?: number | null;
    category?: string | null;
    company?: string | null;
    total_matching_products: number;
    truncated: boolean;
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

export interface AnalyticsUserSale {
    user_id: number;
    username: string;
    role: string;
    transaction_count: number;
    total_revenue: number;
    items_sold: number;
    average_transaction: number;
    cash_register_status?: string | null;
    cash_on_hand?: number | null;
}

export interface AnalyticsOverviewReport {
    period_start: string;
    period_end: string;
    top_n: number;
    months: number;
    low_stock: AnalyticsStockItem[];
    out_of_stock: AnalyticsStockItem[];
    expired_batches: Array<{
        batch_id: number;
        batch_number: string;
        product_id: number;
        product_name: string;
        sku?: string | null;
        category?: string | null;
        company?: string | null;
        quantity_remaining: number;
        base_unit: string;
        expiry_date: string;
        days_expired: number;
        stock_value: number;
    }>;
    low_stock_count: number;
    out_of_stock_count: number;
    expired_batch_count: number;
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
    staff_sales: AnalyticsUserSale[];
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
        product_id?: number;
        category?: string;
        company?: string;
        product_ids?: string;
        categories?: string;
        companies?: string;
        skip?: number;
        max_products?: number;
    }): Promise<ProductSalesHistoryReport> => {
        const response = await api.get('/reports/sales/product-history', { params });
        return response.data;
    },
    exportProductSalesHistory: async (params: {
        start_date?: string;
        end_date?: string;
        search?: string;
        product_id?: number;
        category?: string;
        company?: string;
        product_ids?: string;
        categories?: string;
        companies?: string;
        skip?: number;
        max_products?: number;
    }): Promise<Blob> => {
        const response = await api.get('/reports/sales/product-history', {
            params: { ...params, export: true },
            responseType: 'blob',
        });
        return response.data;
    },
    getProductFilterOptions: async (): Promise<{ categories: string[]; companies: string[] }> => {
        const response = await api.get('/reports/sales/product-filter-options');
        return response.data;
    },
    getProductOptions: async (search: string, limit = 50): Promise<ProductReportOption[]> => {
        const response = await api.get('/reports/sales/product-options', { params: { search, limit } });
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
