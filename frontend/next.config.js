/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['streamdown', 'ai-sdk-elements'],
  // Increase proxy timeout for long-running LLM calls (advisor agent ~30s)
  experimental: {
    proxyTimeout: 180000,
  },
};

module.exports = nextConfig;
