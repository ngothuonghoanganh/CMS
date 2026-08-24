import { ErrorResponseSchema } from '@payload/contracts';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

let refreshInFlight: Promise<void> | null = null;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

const refreshableAuthErrorCodes = new Set([
  'ACCESS_TOKEN_EXPIRED',
  'ACCESS_TOKEN_INVALID',
  'UNAUTHENTICATED',
]);

async function readApiError(response: Response): Promise<ApiClientError> {
  let code = 'REQUEST_FAILED';
  let message = 'The request could not be completed';
  let requestId: string | undefined;

  try {
    const parsed = ErrorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      code = parsed.data.error.code;
      message = parsed.data.error.message;
      requestId = parsed.data.error.requestId;
    }
  } catch {
    // Preserve a safe fallback for non-JSON proxy/network responses.
  }

  return new ApiClientError(response.status, code, message, requestId);
}

async function refreshSession(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = request('/auth/refresh', { method: 'POST' }, false)
      .then(() => undefined)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function clearAuthAndRedirect(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    await fetch(`${apiBaseUrl}/auth/logout`, {
      credentials: 'include',
      method: 'POST',
    });
  } finally {
    if (!window.location.pathname.endsWith('/login')) {
      window.location.assign('/login');
    }
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  allowRefresh = true,
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method === 'GET' && allowRefresh) {
    const existing = inFlightGetRequests.get(path);
    if (existing) return existing as Promise<T>;

    const pending = requestWithoutDedup<T>(path, init, allowRefresh);
    inFlightGetRequests.set(path, pending);
    try {
      return await pending;
    } finally {
      if (inFlightGetRequests.get(path) === pending) {
        inFlightGetRequests.delete(path);
      }
    }
  }

  return requestWithoutDedup<T>(path, init, allowRefresh);
}

async function requestWithoutDedup<T>(
  path: string,
  init?: RequestInit,
  allowRefresh = true,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const error = await readApiError(response);
    const canRefresh =
      allowRefresh &&
      path !== '/auth/login' &&
      path !== '/auth/refresh' &&
      path !== '/auth/logout' &&
      response.status === 401 &&
      refreshableAuthErrorCodes.has(error.code);

    if (canRefresh) {
      try {
        await refreshSession();
        return requestWithoutDedup<T>(path, init, false);
      } catch (refreshError) {
        await clearAuthAndRedirect();
        throw refreshError;
      }
    }

    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { body: JSON.stringify(body), method: 'PATCH' });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      method: 'POST',
    });
  },
};
