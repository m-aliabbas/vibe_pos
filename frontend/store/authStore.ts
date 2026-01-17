import { create } from 'zustand';
import api from '@/lib/api';

interface User {
    username: string;
    role: string;
    is_active: boolean;
}

interface AuthState {
    user: User | null;
    token: string | null;
    login: (credentials: any) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    token: null,

    login: async (credentials) => {
        try {
            const formData = new URLSearchParams();
            formData.append('username', credentials.username);
            formData.append('password', credentials.password);

            const response = await api.post('/auth/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const { access_token } = response.data;
            localStorage.setItem('token', access_token);
            set({ token: access_token });

            const meResponse = await api.get('/auth/me');
            set({ user: meResponse.data });
        } catch (error) {
            console.error("Login failed", error);
            throw error;
        }
    },

    logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null });
    },

    checkAuth: async () => {
        const token = localStorage.getItem('token');
        if (token) {
            set({ token });
            try {
                const response = await api.get('/auth/me');
                set({ user: response.data });
            } catch (error) {
                localStorage.removeItem('token');
                set({ token: null, user: null });
            }
        }
    }
}));
