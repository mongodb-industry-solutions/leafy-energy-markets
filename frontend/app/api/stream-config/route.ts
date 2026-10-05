import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Returns the backend URL the browser should use for SSE connections.
 *
 * Always returns '' so SSE streams go through the Next.js server's beforeFiles
 * rewrites (configured in next.config.js). These rewrites proxy to the internal
 * backend service (INTERNAL_API_URL) at the HTTP server level — no Route Handler
 * fetch() involved — which avoids ERR_HTTP2_PROTOCOL_ERROR from Envoy/Istio
 * buffering SSE responses over HTTP/2.
 *
 * Previously this returned NEXT_PUBLIC_API_URL (backend external ingress) so the
 * browser connected directly, but that path also goes through Envoy HTTP/2.
 */
export async function GET() {
  return NextResponse.json({ streamUrl: '' });
}
