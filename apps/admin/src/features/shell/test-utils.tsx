import type { ErrorCode, ProblemIssue } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

/**
 * Whether a click reaches the element, as user-event decides it: the closest `pointer-events`
 * set on the element or an ancestor is not `none`.
 */
function takesClicks(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const value = window.getComputedStyle(node).pointerEvents;
    if (value !== '' && value !== 'inherit' && value !== 'unset') {
      return value !== 'none';
    }
  }
  return true;
}

/**
 * The button of a toast's action, once a click reaches it. Radix counts a new toast in an effect
 * and keeps its region from the pointer until then: a test that clicks the moment the toast shows,
 * sooner than anyone could, misses it whenever that effect runs late (a busy machine).
 */
export async function findToastAction(name: string): Promise<HTMLElement> {
  const action = await screen.findByRole('button', { name });
  await waitFor(() => {
    if (!takesClicks(action)) {
      throw new Error(`The toast action “${name}” does not take clicks yet`);
    }
  });
  return action;
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
