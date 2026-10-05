import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Returns the backend URL the browser should use for SSE connections.
 *
 * Always returns '' so SSE goes through the Route Handler catch-all proxy
 * (/api/[...path]/route.ts) which connects to INTERNAL_API_URL over HTTP/1.1.
 * Direct browser→backend connections go through the Istio ingress gateway
 * which uses HTTP/2 and buffers SSE responses.
 */
export async function GET() {
  return NextResponse.json({ streamUrl: '' });
}
