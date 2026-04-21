/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['streamdown', 'ai-sdk-elements'],
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
  // Increase proxy timeout for long-running LLM calls (advisor agent ~30s)
  experimental: {
    proxyTimeout: 180000,
  },
};

module.exports = nextConfig;
