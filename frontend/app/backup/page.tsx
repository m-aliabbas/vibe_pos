"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Database,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  HardDrive,
  Clock
} from 'lucide-react';
import api from '@/lib/api';

interface DatabaseFile {
  path: string;
  size: number;
  size_mb: number;
}

interface BackupFile {
  filename: string;
  size: number;
  size_mb: number;
  created: string;
}

interface SchedulerStatus {
  running: boolean;
  next_run: string | null;
  jobs?: number;
}

export default function BackupPage() {
  const [dbFiles, setDbFiles] = useState<DatabaseFile[]>([]);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fetchDatabaseFiles = async () => {
    try {
      const response = await api.get('/backup/list-files');
      setDbFiles(response.data.files || []);
    } catch (error) {
      console.error('Failed to fetch database files:', error);
    }
  };

  const fetchBackups = async () => {
    try {
      const response = await api.get('/backup/list');
      setBackups(response.data.backups || []);
    } catch (error) {
      console.error('Failed to fetch backups:', error);
    }
  };

  const fetchSchedulerStatus = async () => {
    try {
      const response = await api.get('/backup/scheduler/status');
      setSchedulerStatus(response.data.scheduler);
    } catch (error) {
      console.error('Failed to fetch scheduler status:', error);
    }
  };

  useEffect(() => {
    fetchDatabaseFiles();
    fetchBackups();
    fetchSchedulerStatus();
    
    // Refresh scheduler status every 30 seconds
    const interval = setInterval(fetchSchedulerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateBackup = async () => {
    try {
      setLoading(true);
      setMessage(null);

      // Create backup on backend
      const response = await api.post('/backup/create');

      if (response.data.success) {
        // Download the backup file
        const downloadResponse = await api.get(
          `/backup/download/${response.data.backup_filename}`,
          { responseType: 'blob' }
        );

        // Save to user's downloads folder
        const blob = new Blob([downloadResponse.data], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.data.backup_filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setMessage({
          type: 'success',
          text: `Backup created successfully! File: ${response.data.backup_filename}`
        });

        fetchBackups();
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Backup failed: ${error.response?.data?.detail || error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    try {
      setLoading(true);
      setMessage(null);

      // Confirm restoration first
      const confirmed = window.confirm(
        'Are you sure you want to restore from a backup?\n\n' +
        'This will replace all current database files and the application will need to be restarted.\n\n' +
        'Click OK to continue.'
      );

      if (!confirmed) {
        setLoading(false);
        return;
      }

      // Open file dialog
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.zip';

      fileInput.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
          const response = await api.post('/backup/restore', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });

          if (response.data.success) {
            setMessage({
              type: 'success',
              text: 'Backup restored successfully! Please restart the application for changes to take effect.'
            });
          }
        } catch (error: any) {
          setMessage({
            type: 'error',
            text: `Restore failed: ${error.response?.data?.detail || error.message}`
          });
        } finally {
          setLoading(false);
        }
      };

      fileInput.click();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Restore failed: ${error.message}`
      });
      setLoading(false);
    }
  };

  const handleTestAutomaticBackup = async () => {
    try {
      setLoading(true);
      setMessage(null);

      const response = await api.post('/backup/test-automatic');

      if (response.data.success) {
        setMessage({
          type: 'success',
          text: response.data.message
        });
        
        // Refresh backups after a few seconds
        setTimeout(() => {
          fetchBackups();
        }, 3000);
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Test backup failed: ${error.response?.data?.detail || error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Database className="h-8 w-8 text-blue-600" />
          Database Backup & Restore
        </h1>
        <p className="text-gray-600 mt-2">
          Manage your database backups and restore points
        </p>
      </div>

      {/* Message Alert */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className="mb-6">
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Automatic Backup Scheduler Status */}
      {schedulerStatus && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Automatic Backup Scheduler
            </CardTitle>
            <CardDescription>
              Daily backups run automatically at 12:00 PM
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant={schedulerStatus.running ? "default" : "secondary"}>
                {schedulerStatus.running ? '✓ Running' : '○ Stopped'}
              </Badge>
            </div>
            {schedulerStatus.next_run && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Next Scheduled Run:</span>
                <span className="text-sm text-gray-700">
                  {formatDate(schedulerStatus.next_run)}
                </span>
              </div>
            )}
            <Button
              onClick={handleTestAutomaticBackup}
              disabled={loading}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Automatic Backup Now'
              )}
            </Button>
            <p className="text-xs text-gray-600">
              Automatic backups are stored in the <code className="bg-white px-1 rounded">backups/auto</code> directory
              and kept for 7 days.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Database Files Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Files
          </CardTitle>
          <CardDescription>
            These files will be included in your backup
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dbFiles.length === 0 ? (
            <p className="text-gray-500 text-sm">Loading database files...</p>
          ) : (
            <div className="space-y-2">
              {dbFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-4 w-4 text-gray-500" />
                    <span className="font-mono text-sm">{file.path}</span>
                  </div>
                  <Badge variant="secondary">{file.size_mb} MB</Badge>
                </div>
              ))}
              <div className="pt-2 border-t mt-4">
                <p className="text-sm text-gray-600">
                  Total: <strong>{dbFiles.length}</strong> files •{' '}
                  <strong>
                    {dbFiles.reduce((sum, f) => sum + f.size_mb, 0).toFixed(2)} MB
                  </strong>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Create Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Create Backup
            </CardTitle>
            <CardDescription>
              Export all database files to a ZIP archive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              This will create a timestamped backup of all your database files.
              You can save it anywhere on your computer for safekeeping.
            </p>
            <Button
              onClick={handleCreateBackup}
              disabled={loading || dbFiles.length === 0}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Backup...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Create Backup
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Restore Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Restore Backup
            </CardTitle>
            <CardDescription>
              Restore database files from a backup archive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Warning:</strong> Restoring will replace all current database files.
                Make sure to create a backup first!
              </AlertDescription>
            </Alert>
            <Button
              onClick={handleRestoreBackup}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Restore from Backup
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Backups
          </CardTitle>
          <CardDescription>
            Backups stored in the application data directory
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <p className="text-gray-500 text-sm">No backups found</p>
          ) : (
            <div className="space-y-2">
              {backups.slice(0, 10).map((backup, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Database className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="font-mono text-sm">{backup.filename}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(backup.created)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{backup.size_mb} MB</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
