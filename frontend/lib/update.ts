import packageJson from '@/package.json';

export const CURRENT_APP_VERSION = packageJson.version;

export const UPDATE_MANIFEST_URL =
  process.env.NEXT_PUBLIC_UPDATE_MANIFEST_URL ??
  'https://github.com/m-aliabbas/vibepos-releases/releases/latest/download/latest.json';

export type ReleaseTarget =
  | 'windows-x86_64'
  | 'darwin-aarch64'
  | 'darwin-x86_64';

export interface ReleaseDownload {
  url: string;
  sha256: string;
  size: number;
}

export interface UpdateManifest {
  schema_version: 1;
  version: string;
  published_at: string;
  notes: string;
  release_url: string;
  downloads: Partial<Record<ReleaseTarget, ReleaseDownload>>;
}

const SEMVER_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseVersion(version: string): ParsedVersion | null {
  const match = version.trim().match(SEMVER_PATTERN);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftIsNumber = /^\d+$/.test(leftPart);
    const rightIsNumber = /^\d+$/.test(rightPart);
    if (leftIsNumber && rightIsNumber) {
      return Number(leftPart) > Number(rightPart) ? 1 : -1;
    }
    if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
    return leftPart.localeCompare(rightPart) > 0 ? 1 : -1;
  }

  return 0;
}

export function compareVersions(left: string, right: string): number {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  if (!parsedLeft || !parsedRight) {
    throw new Error('The update service returned an invalid application version.');
  }

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (parsedLeft[key] !== parsedRight[key]) {
      return parsedLeft[key] > parsedRight[key] ? 1 : -1;
    }
  }

  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

export function detectReleaseTarget(): ReleaseTarget | null {
  if (typeof navigator === 'undefined') return null;

  const identity = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (identity.includes('win')) return 'windows-x86_64';
  if (identity.includes('mac')) {
    return identity.includes('arm') ? 'darwin-aarch64' : 'darwin-x86_64';
  }
  return null;
}

function isReleaseDownload(value: unknown): value is ReleaseDownload {
  if (!value || typeof value !== 'object') return false;
  const download = value as Partial<ReleaseDownload>;
  return (
    typeof download.url === 'string' &&
    download.url.startsWith('https://') &&
    typeof download.sha256 === 'string' &&
    /^[a-fA-F0-9]{64}$/.test(download.sha256) &&
    typeof download.size === 'number' &&
    download.size >= 0
  );
}

function validateManifest(value: unknown): UpdateManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('The update service returned an invalid response.');
  }

  const manifest = value as Partial<UpdateManifest>;
  if (
    manifest.schema_version !== 1 ||
    typeof manifest.version !== 'string' ||
    !parseVersion(manifest.version) ||
    typeof manifest.published_at !== 'string' ||
    Number.isNaN(Date.parse(manifest.published_at)) ||
    typeof manifest.notes !== 'string' ||
    typeof manifest.release_url !== 'string' ||
    !manifest.release_url.startsWith('https://') ||
    !manifest.downloads ||
    typeof manifest.downloads !== 'object'
  ) {
    throw new Error('The update service returned incomplete release information.');
  }

  for (const download of Object.values(manifest.downloads)) {
    if (!isReleaseDownload(download)) {
      throw new Error('The update service returned an invalid download.');
    }
  }

  return manifest as UpdateManifest;
}

export async function fetchLatestRelease(): Promise<UpdateManifest> {
  const response = await fetch(UPDATE_MANIFEST_URL, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) {
    throw new Error('No public VibePOS release has been published yet.');
  }
  if (!response.ok) {
    throw new Error(`The update service is unavailable (${response.status}).`);
  }

  return validateManifest(await response.json());
}
