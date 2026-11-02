import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onSessionExpired } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const unauthorized = () => json(401, { type: 'about:blank', title: 'Unauthorized', status: 401 });

/** A fake API whose access token has expired; /auth/refresh succeeds or fails. */
function fakeApi({ refreshOk }: { refreshOk: boolean }) {
  let sessionValid = false;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/refresh') {
      await new Promise((r) => setTimeout(r, 10)); // slow enough for the other 401s to arrive
      sessionValid = refreshOk;
      return refreshOk ? json(200, {}) : unauthorized();
    }
    return sessionValid ? json(200, { id: '1' }) : unauthorized();
  });
  vi.stubGlobal('fetch', fetchMock);
  const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => u === url).length;
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api: session refresh', () => {
  // Pinned: refresh tokens are single-use, so a second parallel refresh would
  // replay the same token and the API would revoke the session.
  it('3 simultaneous 401s → exactly 1 /auth/refresh, then each request retried once', async () => {
    const { calls } = fakeApi({ refreshOk: true });

    const results = await Promise.all([api.get('/users/me'), api.get('/users/me'), api.get('/users/me')]);

    expect(results).toEqual([{ id: '1' }, { id: '1' }, { id: '1' }]);
    expect(calls('/api/auth/refresh')).toBe(1);
    expect(calls('/api/users/me')).toBe(6); // 3 originals + 3 retries
  });

  it('signals session expiry and rejects with 401 when the refresh fails', async () => {
    fakeApi({ refreshOk: false });
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);

    const error = await api.get('/users/me').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(expired).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('never refreshes for auth routes: a wrong password is just a 401', async () => {
    const { calls } = fakeApi({ refreshOk: true });

    await expect(api.post('/auth/signin', {})).rejects.toBeInstanceOf(ApiError);
    expect(calls('/api/auth/refresh')).toBe(0);
  });

  it('turns a network failure into an ApiError the UI can show', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await api.get('/users/me').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(/Can’t reach the server/);
  });
});
