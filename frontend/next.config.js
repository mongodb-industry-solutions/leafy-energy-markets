/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['streamdown', 'ai-sdk-elements'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },
  // Increase proxy timeout for long-running LLM calls (advisor agent ~30s)
  experimental: {
    proxyTimeout: 180000,
  },
};

module.exports = nextConfig;
