/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['streamdown', 'ai-sdk-elements'],
  // /api-ws/ rewrite: dedicated path for WebSocket proxying.
  // App Router Route Handlers can't proxy WebSocket upgrades (fetch() limitation),
  // so WebSocket traffic uses a separate prefix outside the /api catch-all handler.
  async rewrites() {
    const backendUrl = process.env.INTERNAL_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api-ws/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  // Increase proxy timeout for long-running LLM calls (advisor agent ~30s)
  experimental: {
    proxyTimeout: 180000,
  },
};

module.exports = nextConfig;
