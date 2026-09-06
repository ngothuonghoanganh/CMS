import type { NextConfig } from 'next';

const apiBaseUrl = (
  process.env.RENDERER_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://127.0.0.1:3001/api/v1'
).replace(/\/$/, '');

const nextConfig: NextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  async rewrites() {
    return [
      {
        source: '/api/v1/public/assets/:path*',
        destination: `${apiBaseUrl}/public/assets/:path*`,
      },
    ];
  },
};

export default nextConfig;
