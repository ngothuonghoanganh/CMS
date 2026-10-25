import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { parseAdminEnv } from './src/env';

// One .env at the repository root serves every app in development. Next has already loaded the
// app directory, so force a reload to read the root file.
loadEnvConfig(
  resolve(process.cwd(), '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
);
const env = parseAdminEnv(process.env);

const config: NextConfig = {
  transpilePackages: ['@plp/ui', '@plp/sections'],
  // The browser talks to the API through the admin origin, so the session cookie stays first-party.
  rewrites() {
    return Promise.resolve([
      { source: '/api/:path*', destination: `${env.API_INTERNAL_URL}/:path*` },
    ]);
  },
};

export default config;
