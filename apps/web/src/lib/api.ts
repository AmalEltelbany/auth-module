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

// The only place that calls fetch. Same origin (/api is proxied), so the
// httpOnly session cookie rides along and JavaScript never sees a token.
async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
