'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAppConfig } from '@/components/AppConfigProvider';
import { isAxiosError } from 'axios';
import { authApi } from '@/lib/api';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [bootstrapUsername, setBootstrapUsername] = useState('');
    const [bootstrapEmail, setBootstrapEmail] = useState('');
    const [bootstrapPassword, setBootstrapPassword] = useState('');
    const [bootstrapConfirmation, setBootstrapConfirmation] = useState('');
    const [bootstrapError, setBootstrapError] = useState('');
    const [bootstrapLoading, setBootstrapLoading] = useState(false);
    const [bootstrapComplete, setBootstrapComplete] = useState(false);
    const login = useAuthStore((state) => state.login);
    const router = useRouter();
    const { config, refresh } = useAppConfig();
    const applicationName = config.application_id === 'retail' ? 'VibePOS' : config.application_name;
    const showBootstrap = config.application_id !== 'retail' && config.bootstrap_required && !bootstrapComplete;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login({ username, password });
            router.push('/');
        } catch (error: unknown) {
            const detail = isAxiosError(error) ? error.response?.data?.detail : undefined;
            setError(typeof detail === 'string' ? detail : 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleBootstrap = async (event: React.FormEvent) => {
        event.preventDefault();
        setBootstrapError('');
        if (bootstrapPassword !== bootstrapConfirmation) {
            setBootstrapError('Passwords do not match.');
            return;
        }

        setBootstrapLoading(true);
        try {
            await authApi.bootstrapAdmin({
                username: bootstrapUsername,
                email: bootstrapEmail || undefined,
                password: bootstrapPassword,
            });
            setUsername(bootstrapUsername);
            setBootstrapComplete(true);
            await refresh();
        } catch (error: unknown) {
            const detail = isAxiosError(error) ? error.response?.data?.detail : undefined;
            setBootstrapError(typeof detail === 'string'
                ? detail
                : 'Administrator setup failed. Please retry.');
        } finally {
            setBootstrapLoading(false);
        }
    };

    return (
        <div className="h-full flex items-center justify-center bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 p-4">
            <Card className="w-full max-w-md bg-white/95 backdrop-blur shadow-2xl border-0">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-3xl font-bold text-center text-blue-900 tracking-tight">{applicationName}</CardTitle>
                    <CardDescription className="text-center text-base">
                        {showBootstrap ? 'Create the first administrator' : 'by vibe.exe'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {showBootstrap ? (
                        <form onSubmit={handleBootstrap} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="bootstrap-username">Administrator username</Label>
                                <Input
                                    id="bootstrap-username"
                                    autoComplete="username"
                                    minLength={3}
                                    maxLength={64}
                                    value={bootstrapUsername}
                                    onChange={(event) => setBootstrapUsername(event.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bootstrap-email">Email (optional)</Label>
                                <Input
                                    id="bootstrap-email"
                                    type="email"
                                    autoComplete="email"
                                    value={bootstrapEmail}
                                    onChange={(event) => setBootstrapEmail(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bootstrap-password">Administrator password</Label>
                                <Input
                                    id="bootstrap-password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    value={bootstrapPassword}
                                    onChange={(event) => setBootstrapPassword(event.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bootstrap-confirmation">Confirm password</Label>
                                <Input
                                    id="bootstrap-confirmation"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    value={bootstrapConfirmation}
                                    onChange={(event) => setBootstrapConfirmation(event.target.value)}
                                    required
                                />
                            </div>
                            {bootstrapError && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>{bootstrapError}</AlertDescription>
                                </Alert>
                            )}
                            <Button
                                type="submit"
                                className="w-full bg-indigo-600 hover:bg-indigo-700 transition-all font-semibold h-11"
                                disabled={bootstrapLoading}
                            >
                                {bootstrapLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Create Administrator'}
                            </Button>
                        </form>
                    ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="focus-visible:ring-indigo-600"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="focus-visible:ring-indigo-600"
                            />
                        </div>
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-700 transition-all font-semibold h-11"
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign In'}
                        </Button>
                    </form>
                    )}
                </CardContent>
                <CardFooter className="text-center text-xs text-gray-400 justify-center pb-6">
                    Authorized Personnel Only • v1.0.0
                </CardFooter>
            </Card>
        </div>
    );
}
