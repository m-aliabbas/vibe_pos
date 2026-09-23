import type { NextRequest } from "next/server";

const BACKEND_ORIGIN = "http://127.0.0.1:8000";
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
]);
const RECOMPUTED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

async function proxyRequest(request: NextRequest) {
  const target = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    BACKEND_ORIGIN,
  );

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_REQUEST_HEADERS) {
    headers.delete(header);
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: BODYLESS_METHODS.has(request.method)
      ? undefined
      : await request.arrayBuffer(),
    redirect: "follow",
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstream.headers);
  for (const header of RECOMPUTED_RESPONSE_HEADERS) {
    responseHeaders.delete(header);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const dynamic = "force-dynamic";

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
export const HEAD = proxyRequest;
