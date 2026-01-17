'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Mail, Lock, User } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface UserProfile {
    id: number;
    username: string;
    email: string | null;
    role: string;
    is_active: boolean;
}

export default function ProfilePage() {
    const router = useRouter();
    const { user, token } = useAuthStore();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    
    // Form state
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);

    useEffect(() => {
        if (!token) {
            router.push('/login');
            return;
        }
        fetchProfile();
    }, [token, router]);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/users/me', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setProfile(data);
            setUsername(data.username);
            setEmail(data.email || '');
        } catch (error) {
            console.error("Failed to fetch profile", error);
            alert("Failed to load profile");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveLoading(true);
        try {
            const { data } = await api.put('/users/me', {
                username,
                email: email || null,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            setProfile(data);
            setEditing(false);
            alert('Profile updated successfully');
        } catch (error: any) {
            console.error("Failed to update profile", error);
            alert(error.response?.data?.detail || "Failed to update profile");
        } finally {
            setSaveLoading(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (newPassword !== confirmPassword) {
            alert('New passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }

        setSaveLoading(true);
        try {
            await api.put('/users/me', {
                username,
                email: email || null,
                password: newPassword,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            setPasswordDialogOpen(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            alert('Password changed successfully');
        } catch (error: any) {
            console.error("Failed to change password", error);
            alert(error.response?.data?.detail || "Failed to change password");
        } finally {
            setSaveLoading(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center">Loading profile...</div>;
    }

    if (!profile) {
        return <div className="p-8 text-center">Profile not found</div>;
    }

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="mb-4"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
                <p className="text-gray-500 mt-2">Manage your account settings and security</p>
            </div>

            {/* Profile Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Account Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {!editing ? (
                        <>
                            {/* Display Mode */}
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-gray-500 text-sm">Username</Label>
                                    <p className="text-lg font-semibold mt-1">{profile.username}</p>
                                </div>
                                <div>
                                    <Label className="text-gray-500 text-sm">Email</Label>
                                    <p className="text-lg font-semibold mt-1 flex items-center gap-2">
                                        <Mail className="h-4 w-4" />
                                        {profile.email || 'Not provided'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-gray-500 text-sm">Role</Label>
                                    <div className="mt-1">
                                        <Badge
                                            variant={profile.role === 'admin' ? 'default' : 'secondary'}
                                            className={profile.role === 'admin' ? 'bg-purple-600' : 'bg-blue-600 text-white'}
                                        >
                                            {profile.role.toUpperCase()}
                                        </Badge>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-gray-500 text-sm">Status</Label>
                                    <div className="mt-1">
                                        <Badge
                                            variant="outline"
                                            className={profile.is_active ? "text-green-600 border-green-600" : "text-red-600 border-red-600"}
                                        >
                                            {profile.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t pt-4 space-y-3">
                                <Button onClick={() => setEditing(true)} className="w-full">
                                    <Save className="mr-2 h-4 w-4" /> Edit Profile
                                </Button>
                                <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full">
                                            <Lock className="mr-2 h-4 w-4" /> Change Password
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Change Password</DialogTitle>
                                            <DialogDescription>
                                                Enter your new password below
                                            </DialogDescription>
                                        </DialogHeader>
                                        <form onSubmit={handleChangePassword} className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="new-password">New Password</Label>
                                                <Input
                                                    id="new-password"
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    required
                                                    minLength={6}
                                                />
                                                <p className="text-xs text-gray-500">Must be at least 6 characters</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="confirm-password">Confirm Password</Label>
                                                <Input
                                                    id="confirm-password"
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    required
                                                    minLength={6}
                                                />
                                            </div>
                                            <DialogFooter>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setPasswordDialogOpen(false);
                                                        setCurrentPassword('');
                                                        setNewPassword('');
                                                        setConfirmPassword('');
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button type="submit" disabled={saveLoading}>
                                                    {saveLoading ? 'Saving...' : 'Change Password'}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Edit Mode */}
                            <form onSubmit={handleUpdateProfile} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="username">Username</Label>
                                    <Input
                                        id="username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-email">Email</Label>
                                    <Input
                                        id="edit-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                                <div className="border-t pt-4 space-y-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => {
                                            setEditing(false);
                                            setUsername(profile.username);
                                            setEmail(profile.email || '');
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" className="w-full" disabled={saveLoading}>
                                        {saveLoading ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </form>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Account ID Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Account Details</CardTitle>
                    <CardDescription>Internal account information</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-sm text-gray-600">
                        <p>User ID: <span className="font-mono text-gray-900">#{profile.id}</span></p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
