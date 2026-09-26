import type { NextRequest } from "next/server";

const BACKEND_ORIGIN = `http://127.0.0.1:${process.env.BACKEND_PORT || "8000"}`;
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
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
  let target = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    BACKEND_ORIGIN,
  );

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_REQUEST_HEADERS) {
    headers.delete(header);
  }

  let method = request.method;
  const requestBody = BODYLESS_METHODS.has(method)
    ? undefined
    : new Uint8Array(await request.arrayBuffer());
  let upstream: Response;
  let redirectCount = 0;

  while (true) {
    upstream = await fetch(target, {
      method,
      headers,
      body: BODYLESS_METHODS.has(method) ? undefined : requestBody?.slice(),
      redirect: "manual",
      cache: "no-store",
    });

    if (!REDIRECT_STATUSES.has(upstream.status)) break;

    const location = upstream.headers.get("location");
    if (!location) break;

    const redirectTarget = new URL(location, target);
    if (redirectTarget.origin !== BACKEND_ORIGIN) break;

    if (redirectCount >= MAX_REDIRECTS) {
      await upstream.arrayBuffer();
      return Response.json(
        { detail: "Backend API redirect limit exceeded" },
        { status: 508 },
      );
    }

    await upstream.arrayBuffer();
    redirectCount += 1;
    target = redirectTarget;

    if (
      upstream.status === 303 ||
      ((upstream.status === 301 || upstream.status === 302) && method === "POST")
    ) {
      method = "GET";
    }
  }

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
