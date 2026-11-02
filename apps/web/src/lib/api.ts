import type { ProblemDetails } from '@auth-module/shared/types';

/** Every failed request rejects with this, carrying the API's RFC 9457 body. */
export class ApiError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }

  get status() {
    return this.problem.status;
  }

  get fieldErrors() {
    return this.problem.errors ?? [];
  }
}

const networkError = (): ProblemDetails => ({
  type: 'about:blank',
  title: 'Network error',
  status: 0,
  detail: 'Can’t reach the server. Check your connection and try again.',
});

const sessionExpiredListeners = new Set<() => void>();

/** Called when a session can't be refreshed any more. Returns an unsubscribe function. */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

// One refresh in flight at a time, shared by every request that got a 401.
// Refresh tokens are single-use: two parallel refreshes would present the same
// token twice, which the API treats as theft and answers by revoking the session.
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// The only place that calls fetch. Same origin (/api is proxied), so the
// httpOnly session cookies ride along and JavaScript never sees a token.
async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const send = () =>
    fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res: Response;
  try {
    res = await send();
    // An expired access token: refresh once, then retry once. Auth routes
    // answer 401 for their own reasons (wrong password), so they're left alone.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      if (await refreshSession()) {
        res = await send();
      } else {
        sessionExpiredListeners.forEach((listener) => listener());
      }
    }
  } catch {
    throw new ApiError(networkError());
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError((data as ProblemDetails | null) ?? { type: 'about:blank', title: res.statusText, status: res.status });
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T = void>(path: string, body?: unknown) => request<T>('POST', path, body),
};
