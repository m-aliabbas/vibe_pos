const STORAGE_KEY = 'vibepos_backend_url';
const DISCOVERY_PORT = 5025;
const FALLBACK = `http://127.0.0.1:${DISCOVERY_PORT}/api/v1`;

/**
 * Returns the currently cached backend URL, or the localhost fallback.
 * Safe to call synchronously (no network I/O).
 */
export function getBackendUrl(): string {
    if (typeof window === 'undefined') return FALLBACK;
    return sessionStorage.getItem(STORAGE_KEY) || FALLBACK;
}

/**
 * In a plain browser (no Tauri), if the page is served from a non-localhost
 * host (e.g. http://192.168.1.10:3000), the backend is on the same machine,
 * so we can derive the backend URL from window.location.hostname.
 */
function deriveFromWindowLocation(): string | null {
    if (typeof window === 'undefined') return null;
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return `http://${hostname}:${DISCOVERY_PORT}/api/v1`;
    }
    return null;
}

/**
 * Discovers the VibePOS backend:
 * 1. Tauri (desktop): scans LAN subnet on port 5025 via Rust command (~500ms first time)
 * 2. Browser on LAN: derives backend IP from window.location.hostname (instant)
 * 3. Dev / localhost: falls back to 127.0.0.1:5025
 * All results cached in sessionStorage for the rest of the session.
 */
export async function discoverBackend(): Promise<string> {
    if (typeof window === 'undefined') return FALLBACK;

    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (cached) return cached;

    // 1. Try Tauri LAN scan
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const ip = await invoke<string | null>('discover_backend', { port: DISCOVERY_PORT });
        if (ip) {
            const url = `http://${ip}:${DISCOVERY_PORT}/api/v1`;
            sessionStorage.setItem(STORAGE_KEY, url);
            console.log(`[VibePOS] Backend discovered via LAN scan: ${url}`);
            return url;
        }
    } catch {
        // Not running inside Tauri — fall through to browser strategies
    }

    // 2. Browser served from the backend server (e.g. http://192.168.1.10:3000)
    const derived = deriveFromWindowLocation();
    if (derived) {
        sessionStorage.setItem(STORAGE_KEY, derived);
        console.log(`[VibePOS] Backend derived from page origin: ${derived}`);
        return derived;
    }

    // 3. Dev / localhost fallback
    sessionStorage.setItem(STORAGE_KEY, FALLBACK);
    return FALLBACK;
}

/**
 * Clears the cached backend URL so the next call to discoverBackend()
 * will scan the network again. Useful if the server moves.
 */
export function clearDiscoveryCache(): void {
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEY);
    }
}
