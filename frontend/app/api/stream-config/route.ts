import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Returns the backend URL the browser should use for SSE connections.
 *
 * In production/staging, NEXT_PUBLIC_API_URL is injected at runtime by Helm
 * (e.g. https://leafy-energy-markets-backend.industrysolutions.prod.corp.mongodb.com).
 * The browser connects directly to the backend for SSE, bypassing the Next.js
 * proxy layer which can buffer or break long-lived streaming responses.
 *
 * Locally NEXT_PUBLIC_API_URL is not set, so streamUrl returns '' and the browser
 * falls back to '/api/...' through the Route Handler proxy — which works fine
 * without an Istio mesh.
 */
export async function GET() {
  const streamUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  // Don't return a relative path — that would produce double '/api/api/...'
  const safeUrl = streamUrl.startsWith('http') ? streamUrl : '';
  return NextResponse.json({ streamUrl: safeUrl });
}
