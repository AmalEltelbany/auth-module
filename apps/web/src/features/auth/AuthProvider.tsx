import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { SignInInput, SignUpInput } from '@auth-module/shared/auth-schemas';
import type { User } from '@auth-module/shared/types';
import { ApiError, api, onSessionExpired } from '@/lib/api';

// Only a 401 means "not signed in". An unreachable or restarting API (network
// error, 5xx) is retried a few times instead of showing the sign-in page.
const BOOT_RETRY_DELAYS_MS = [300, 1000, 3000];
const isTransient = (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status >= 500);

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' };

type AuthValue = AuthState & {
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads the user, e.g. after verifying the email. */
  reloadUser: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number): void => {
      api
        .get<User>('/users/me')
        .then((user) => active && setState({ status: 'authenticated', user }))
        .catch((error: unknown) => {
          if (!active) return;
          const delay = BOOT_RETRY_DELAYS_MS[attempt];
          if (isTransient(error) && delay !== undefined) retryTimer = setTimeout(() => load(attempt + 1), delay);
          else setState({ status: 'unauthenticated' });
        });
    };
    load(0);

    // Logging out in one tab logs out every tab.
    const channel = new BroadcastChannel('auth');
    channel.onmessage = (e) => e.data === 'logout' && setState({ status: 'unauthenticated' });
    // A request whose session couldn't be refreshed signs the user out.
    const unsubscribe = onSessionExpired(() => setState({ status: 'unauthenticated' }));
    return () => {
      active = false;
      clearTimeout(retryTimer);
      channel.close();
      unsubscribe();
    };
  }, []);

  // While signed in, coming back to the tab re-checks the session (it may have
  // expired, or the email been verified in another tab). Signed out, there is
  // nothing to re-check.
  const signedIn = state.status === 'authenticated';
  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      api
        .get<User>('/users/me')
        .then((user) => setState({ status: 'authenticated', user }))
        // Offline or a restarting API isn't "signed out": keep the session and
        // check again on the next visit. Only a 401 ends it.
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) setState({ status: 'unauthenticated' });
        });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [signedIn]);

  const value: AuthValue = {
    ...state,
    async signUp(input) {
      const user = await api.post<User>('/auth/signup', input);
      setState({ status: 'authenticated', user });
    },
    async signIn(input) {
      const user = await api.post<User>('/auth/signin', input);
      setState({ status: 'authenticated', user });
    },
    async signOut() {
      await api.post('/auth/logout').catch(() => {}); // the session ends locally either way
      setState({ status: 'unauthenticated' });
      new BroadcastChannel('auth').postMessage('logout');
    },
    async reloadUser() {
      const user = await api.get<User>('/users/me');
      setState({ status: 'authenticated', user });
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
