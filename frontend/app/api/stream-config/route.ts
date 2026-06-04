import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Returns the backend URL the browser should use for SSE connections.
 *
 * In production/staging, NEXT_PUBLIC_API_URL is injected at runtime by Helm
 * (e.g. https://leafy-energy-markets-backend.industrysolutions.prod.corp.mongodb.com).
 * Server-side code reads the actual process env, not the build-time '/api' replacement.
 *
 * Returning this to the browser lets TradingEventsProvider connect directly to
 * the backend's external ingress, bypassing the internal Istio/Envoy mesh that
 * buffers SSE responses (Envoy waits for a never-ending response to "complete").
 *
 * Locally NEXT_PUBLIC_API_URL is not set (build arg is '/api' but that's baked
 * into client bundles, not process.env), so streamUrl returns '' and the browser
 * falls back to '/api/trading/events/stream' through the proxy — which works
 * fine without an Istio mesh.
 */
export async function GET() {
  const streamUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  // Don't return a relative path — that would produce double '/api/api/...'
  const safeUrl = streamUrl.startsWith('http') ? streamUrl : '';
  return NextResponse.json({ streamUrl: safeUrl });
}
