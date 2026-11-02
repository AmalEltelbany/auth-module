import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { SignInInput, SignUpInput } from '@auth-module/shared/auth-schemas';
import type { User } from '@auth-module/shared/types';
import { api, onSessionExpired } from '@/lib/api';

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' };

type AuthValue = AuthState & {
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    api
      .get<User>('/users/me')
      .then((user) => active && setState({ status: 'authenticated', user }))
      .catch(() => active && setState({ status: 'unauthenticated' }));

    // Logging out in one tab logs out every tab.
    const channel = new BroadcastChannel('auth');
    channel.onmessage = (e) => e.data === 'logout' && setState({ status: 'unauthenticated' });
    // A request whose session couldn't be refreshed signs the user out.
    const unsubscribe = onSessionExpired(() => setState({ status: 'unauthenticated' }));
    return () => {
      active = false;
      channel.close();
      unsubscribe();
    };
  }, []);

  // While signed in, coming back to the tab re-checks the session (it may have
  // expired meanwhile). Signed out, there is nothing to re-check.
  const signedIn = state.status === 'authenticated';
  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      api.get<User>('/users/me').catch(() => setState({ status: 'unauthenticated' }));
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
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
