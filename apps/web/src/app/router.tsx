import { createBrowserRouter, type RouteObject } from 'react-router';
import SignInPage from '@/features/auth/pages/SignInPage';
import SignUpPage from '@/features/auth/pages/SignUpPage';
import { GuestOnly, RequireAuth } from '@/features/auth/guards';
import HomePage from '@/features/home/pages/HomePage';
import { NotFoundPage, RouteError } from './errors';

// Pages only reached from an email link: loaded on demand, out of the main bundle.
const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

// Exported so tests render the real route table in a memory router.
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { element: <RequireAuth />, children: [{ index: true, element: <HomePage /> }] },
      {
        element: <GuestOnly />,
        children: [
          { path: 'signin', element: <SignInPage /> },
          { path: 'signup', element: <SignUpPage /> },
          { path: 'forgot-password', lazy: lazyPage(() => import('@/features/auth/pages/ForgotPasswordPage')) },
        ],
      },
      // Open to everyone: the link may be opened signed in or signed out.
      { path: 'verify-email', lazy: lazyPage(() => import('@/features/auth/pages/VerifyEmailPage')) },
      { path: 'reset-password', lazy: lazyPage(() => import('@/features/auth/pages/ResetPasswordPage')) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
