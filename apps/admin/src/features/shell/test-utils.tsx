import type { ErrorCode, ProblemIssue } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ApiError } from '../../lib/api-core';

// Shared by component specs only.

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

/** Renders with the providers of the admin: TanStack Query and toasts. */
export function renderWithProviders(ui: ReactElement, queryClient = createTestQueryClient()) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

/** An API problem as the server sends it. */
export function apiError(
  status: number,
  code: ErrorCode,
  title: string,
  issues?: ProblemIssue[],
): ApiError {
  return new ApiError(status, {
    type: 'about:blank',
    title,
    status,
    code,
    ...(issues === undefined ? {} : { issues }),
  });
}

/** Path arguments and options of the last `api` call to `endpoint`, for focused assertions. */
export function lastCallTo(
  apiMock: { mock: { calls: ReadonlyArray<readonly unknown[]> } },
  endpoint: unknown,
): { args: unknown; options: unknown } {
  const call = apiMock.mock.calls.filter((candidate) => candidate[0] === endpoint).at(-1);
  if (call === undefined) {
    throw new Error('The endpoint was not called');
  }
  return { args: call[1], options: call[2] };
}
