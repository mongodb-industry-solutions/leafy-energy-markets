/** Backend URL for regular fetch calls (proxied through Next.js rewrites) */
export const BACKEND_PROXY = '/api';

/**
 * Backend URL for SSE (EventSource) connections.
 * Next.js dev server buffers proxied SSE responses, so streams connect directly.
 */
export const BACKEND_SSE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000/api';
