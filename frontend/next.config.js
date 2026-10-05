/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['streamdown', 'ai-sdk-elements'],
  // SSE & WebSocket rewrites — handled by Next.js HTTP server as a reverse proxy.
  // The Route Handler catch-all (/api/[...path]/route.ts) uses fetch() + Response(body)
  // which breaks SSE over HTTP/2 (ERR_HTTP2_PROTOCOL_ERROR through Envoy/Istio).
  // beforeFiles rewrites bypass the Route Handler entirely → reliable streaming.
  async rewrites() {
    const backendUrl = process.env.INTERNAL_API_URL || 'http://localhost:8000';
    return {
      beforeFiles: [
        // SSE streaming endpoints — must bypass Route Handler proxy
        { source: '/api/trading/events/stream', destination: `${backendUrl}/api/trading/events/stream` },
        { source: '/api/trading/stream', destination: `${backendUrl}/api/trading/stream` },
        { source: '/api/advisor/stream', destination: `${backendUrl}/api/advisor/stream` },
        { source: '/api/telemetry/stream', destination: `${backendUrl}/api/telemetry/stream` },
      ],
      afterFiles: [],
      fallback: [
        // WebSocket proxy
        { source: '/api-ws/:path*', destination: `${backendUrl}/api/:path*` },
      ],
    };
  },
  // Increase proxy timeout for long-running LLM calls (advisor agent ~30s)
  experimental: {
    proxyTimeout: 180000,
  },
};

module.exports = nextConfig;
