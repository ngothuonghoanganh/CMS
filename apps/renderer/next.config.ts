import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { parseRendererEnv } from './src/env';
import { responseHeaderRules } from './src/http-headers';

// One .env at the repository root serves every app in development. Next has already loaded the
// app directory, so force a reload to read the root file.
loadEnvConfig(
  resolve(process.cwd(), '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
);
// Fail fast at build and boot instead of on the first request.
parseRendererEnv(process.env);

const config: NextConfig = {
  transpilePackages: ['@plp/sections'],
  // `use cache` + cacheTag/cacheLife on the data layer (ADR-009).
  cacheComponents: true,
  partialPrefetching: true,
  // Every visitor gets blocking metadata, as crawlers do. Public pages depend on the host, so a
  // prerendered shell holds nothing; without it the response waits for the release lookup, which
  // keeps real 404/308 statuses (a streamed shell would commit 200 first) and puts the canonical,
  // robots and Open Graph tags in <head> for every client.
  htmlLimitedBots: /.*/,
  headers() {
    return Promise.resolve(responseHeaderRules());
  },
};

export default config;
