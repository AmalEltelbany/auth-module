import { createBrowserRouter, type RouteObject } from 'react-router';
import SignInPage from '@/features/auth/pages/SignInPage';
import SignUpPage from '@/features/auth/pages/SignUpPage';
import { GuestOnly, RequireAuth } from '@/features/auth/guards';
import HomePage from '@/features/home/pages/HomePage';
import { NotFoundPage, RouteError } from './errors';

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
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
