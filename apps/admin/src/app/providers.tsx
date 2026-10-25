'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { installHistoryGuard } from '../features/shell/history-guard';
import { ApiError } from '../lib/api';

// Before hydration, so it runs ahead of the App Router's own popstate listener.
installHistoryGuard();

function shouldRetry(failureCount: number, error: unknown): boolean {
  // Problems from the API (4xx) are final; retry only network or server failures, twice.
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }
  return failureCount < 2;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: 15_000 },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
