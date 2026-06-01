'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface User {
    id: number;
    username: string;
    email: string | null;
    role: string;
    is_active: boolean;
}

export default function UsersPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteUserId, setDeleteUserId] = useState<number | null>(null);

    // Form State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('cashier');

    useEffect(() => {
        // Basic protection (better done with middleware/server components in real app)
        if (user && user.role !== 'admin') {
            router.push('/');
            return;
        }
        fetchUsers();
    }, [user, router]);

    const fetchUsers = async () => {
        try {
            const { data } = await api.get('/users/');
            setUsers(data);
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/users/', {
                username,
                password,
                email: email || null,
                role,
                is_active: true
            });
            setOpen(false);
            resetForm();
            fetchUsers();
        } catch (error) {
            console.error("Failed to create user", error);
            alert("Failed to create user. Username might be taken.");
        }
    };

    const resetForm = () => {
        setUsername('');
        setPassword('');
        setEmail('');
        setRole('cashier');
        setEditingId(null);
    };

    const handleEditUser = (u: User) => {
        setEditingId(u.id);
        setUsername(u.username);
        setEmail(u.email || '');
        setPassword('');
        setRole(u.role);
        setOpen(true);
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                // Update existing user
                await api.put(`/users/${editingId}`, {
                    username,
                    password: password || undefined,
                    email: email || null,
                    role,
                    is_active: true
                });
                alert('User updated successfully');
            } else {
                // Create new user
                await api.post('/users/', {
                    username,
                    password,
                    email: email || null,
                    role,
                    is_active: true
                });
            }
            setOpen(false);
            resetForm();
            fetchUsers();
        } catch (error: any) {
            console.error("Failed to save user", error);
            alert(error.response?.data?.detail || "Failed to save user");
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteUserId) return;
        try {
            await api.delete(`/users/${deleteUserId}`);
            setDeleteDialogOpen(false);
            setDeleteUserId(null);
            fetchUsers();
        } catch (error: any) {
            console.error("Failed to delete user", error);
            alert(error.response?.data?.detail || "Failed to delete user");
        }
    };

    const openDeleteDialog = (id: number) => {
        setDeleteUserId(id);
        setDeleteDialogOpen(true);
    };

    if (!user || user.role !== 'admin') {
        return null;
    }

    return (
        <div className="p-8 max-w-6xl mx-auto h-full flex flex-col gap-6">
            <div className="shrink-0 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
                    <p className="text-gray-500">Manage cashier and admin accounts.</p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-indigo-600 hover:bg-indigo-700">
                            <Plus className="mr-2 h-4 w-4" /> Add User
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Edit User' : 'Add New User'}</DialogTitle>
                            <DialogDescription>
                                {editingId ? 'Update user account details' : 'Create a new account for an administrator or cashier.'}
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSaveUser} className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="username" className="text-right">Username</Label>
                                <Input id="username" value={username} onChange={e => setUsername(e.target.value)} className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="email" className="text-right">Email</Label>
                                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="col-span-3" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="password" className="text-right">Password</Label>
                                <Input id="password" type="password" placeholder={editingId ? "Leave blank to keep current" : ""} value={password} onChange={e => setPassword(e.target.value)} className="col-span-3" required={!editingId} />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="role" className="text-right">Role</Label>
                                <Select onValueChange={setRole} value={role}>
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cashier">Cashier</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
                                <Button type="submit">{editingId ? 'Update User' : 'Create User'}</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto bg-white rounded-md border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((u) => (
                            <TableRow key={u.id}>
                                <TableCell className="font-medium">{u.username}</TableCell>
                                <TableCell>{u.email || '-'}</TableCell>
                                <TableCell>
                                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className={u.role === 'admin' ? 'bg-purple-600' : 'bg-blue-600 text-white'}>
                                        {u.role}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={u.is_active ? "text-green-600 border-green-600" : "text-red-600"}>
                                        {u.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-center space-x-2">
                                    <Button size="sm" variant="outline" onClick={() => handleEditUser(u)}>
                                        Edit
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => openDeleteDialog(u.id)}>
                                        Delete
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete User</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this user? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
