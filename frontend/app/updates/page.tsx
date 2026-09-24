'use client';

import { useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  compareVersions,
  CURRENT_APP_VERSION,
  detectReleaseTarget,
  fetchLatestRelease,
  type UpdateManifest,
} from '@/lib/update';

function formatBytes(bytes: number): string {
  if (bytes === 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function UpdatesPage() {
  const [checking, setChecking] = useState(false);
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = detectReleaseTarget();
  const download = target && manifest ? manifest.downloads[target] : undefined;
  const updateAvailable = manifest
    ? compareVersions(manifest.version, CURRENT_APP_VERSION) > 0
    : false;

  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);
    try {
      setManifest(await fetchLatestRelease());
    } catch (caughtError) {
      setManifest(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'VibePOS could not check for updates.',
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <AdminRouteGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Application Updates</h1>
            <p className="mt-1 text-gray-600">
              Check for official VibePOS releases and download the latest installer.
            </p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600" />
                    Installed version
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Updates are downloaded only from the official VibePOS release repository.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit text-sm">
                  v{CURRENT_APP_VERSION}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Button onClick={checkForUpdates} disabled={checking}>
                {checking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {checking ? 'Checking…' : 'Check for updates'}
              </Button>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {manifest && !updateAvailable && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                VibePOS is up to date. The latest published version is v{manifest.version}.
              </AlertDescription>
            </Alert>
          )}

          {manifest && updateAvailable && (
            <Card className="border-blue-200">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>VibePOS v{manifest.version} is available</CardTitle>
                    <CardDescription className="mt-1">
                      Published {new Date(manifest.published_at).toLocaleString()}
                    </CardDescription>
                  </div>
                  <Badge className="w-fit bg-blue-600">Update available</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-gray-900">What&apos;s new</h2>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{manifest.notes}</p>
                </div>

                {download ? (
                  <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                      <span>Installer: {formatBytes(download.size)}</span>
                      <span className="font-mono text-xs">SHA-256: {download.sha256}</span>
                    </div>
                    <Button asChild>
                      <a href={download.url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-2 h-4 w-4" />
                        Download installer
                      </a>
                    </Button>
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      This release does not contain an installer for this device yet.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
}
