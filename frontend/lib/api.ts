import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000/api/v1',
});

api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

export default api;

// ============ CUSTOMER API FUNCTIONS ============

export interface CustomerSimple {
    id: number;
    customer_id?: string;
    phone?: string;
    name?: string;
    outstanding_balance: number;
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
}

export interface CustomerListResponse {
    id: number;
    customer_id?: string;
    phone?: string;
    name?: string;
    total_purchases: number;
    total_spent: number;
    outstanding_balance: number;
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

    // Add advance payment (buy on behalf of customer)
    addCustomerAdvance: async (id: number, advance: {
        amount: number;
        description: string;
        payment_method?: string;
    }): Promise<any> => {
        const response = await api.post(`/customers/${id}/add-advance`, advance);
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
