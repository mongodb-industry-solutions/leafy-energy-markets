import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Returns the backend URL the browser should use for SSE connections.
 *
 * Returns '' so SSE goes through the /api/* proxy (same as staging).
 * EventSource handles the connection natively via HTTP/1.1.
 */
export async function GET() {
  return NextResponse.json({ streamUrl: '' });
}
