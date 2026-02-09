import { create } from 'zustand';
import api from '@/lib/api';

interface User {
    id: number;
    username: string;
    role: string;
    is_active: boolean;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (credentials: any) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
}

const decodeJwt = (token: string): any | null => {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const decoded = atob(padded);
        return JSON.parse(decoded);
    } catch {
        return null;
    }
};

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    token: null,
    isLoading: true, // Start as loading to prevent premature redirects

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
            const decoded = decodeJwt(access_token);
            const user = decoded ? {
                id: decoded.uid,
                username: decoded.username,
                role: decoded.role,
                is_active: decoded.is_active,
            } : null;
            set({ token: access_token, user, isLoading: false });
        } catch (error) {
            set({ isLoading: false });
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
            const decoded = decodeJwt(token);
            const nowSeconds = Math.floor(Date.now() / 1000);
            if (!decoded || (decoded.exp && decoded.exp <= nowSeconds)) {
                localStorage.removeItem('token');
                set({ token: null, user: null, isLoading: false });
                return;
            }
            const user = {
                id: decoded.uid,
                username: decoded.username,
                role: decoded.role,
                is_active: decoded.is_active,
            } as User;
            set({ token, user, isLoading: false });
        } else {
            set({ isLoading: false });
        }
    }
}));
