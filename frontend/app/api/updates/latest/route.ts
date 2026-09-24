import { NextResponse } from 'next/server';

const UPDATE_MANIFEST_SOURCE_URL =
  process.env.UPDATE_MANIFEST_SOURCE_URL ??
  process.env.NEXT_PUBLIC_UPDATE_MANIFEST_URL ??
  'https://github.com/m-aliabbas/vibepos-releases/releases/latest/download/latest.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // GitHub's permanent latest-release URL redirects to a signed asset URL.
    // Fetching it on the server avoids redirect/CORS failures in desktop webviews.
    const response = await fetch(UPDATE_MANIFEST_SOURCE_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { detail: `The release repository returned HTTP ${response.status}.` },
        { status: response.status },
      );
    }

    const manifest = await response.json();
    return NextResponse.json(manifest, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Failed to fetch the update manifest:', error);
    return NextResponse.json(
      { detail: 'The release repository could not be reached.' },
      { status: 502 },
    );
  }
}
