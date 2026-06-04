import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

async function proxy(req: NextRequest): Promise<Response> {
  const { pathname, search } = req.nextUrl;
  const upstream = `${BACKEND_URL}${pathname}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!['host', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // Buffer the body into an ArrayBuffer before forwarding. Passing req.body
  // (a ReadableStream) directly fails in production builds when the framework
  // has already consumed the stream, and behaves differently across Node versions
  // and through the Istio service mesh. An ArrayBuffer is always safe.
  let body: BodyInit | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const buf = await req.arrayBuffer();
    body = buf.byteLength > 0 ? buf : null;
  }

  const upstreamRes = await fetch(upstream, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
    signal: req.signal,
  });

  const resHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
      resHeaders.set(key, value);
    }
  });
  // Ensure SSE responses are never buffered by Next.js or nginx
  if ((resHeaders.get('content-type') ?? '').includes('text/event-stream')) {
    resHeaders.set('Cache-Control', 'no-cache, no-transform');
    resHeaders.set('X-Accel-Buffering', 'no');
  }

  // Use native Response (not NextResponse) to avoid Next.js response buffering
  // on streaming bodies — critical for SSE event-by-event delivery.
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest) { return proxy(req); }
export async function POST(req: NextRequest) { return proxy(req); }
export async function PUT(req: NextRequest) { return proxy(req); }
export async function PATCH(req: NextRequest) { return proxy(req); }
export async function DELETE(req: NextRequest) { return proxy(req); }
export async function HEAD(req: NextRequest) { return proxy(req); }
export async function OPTIONS(req: NextRequest) { return proxy(req); }
