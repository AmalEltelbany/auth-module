import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ProblemDetails, User } from '@auth-module/shared/types';
import { Providers } from '@/app/providers';
import { routes } from '@/app/router';
import { ApiError } from '@/lib/api';

/** Renders the real app (providers + route table) at `path`. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { router, user };
}

export const problem = (status: number, extra: Partial<ProblemDetails> = {}) =>
  new ApiError({ type: 'about:blank', title: 'Error', status, ...extra });

export const ada: User = { id: '1', email: 'ada@example.com', name: 'Ada Lovelace', emailVerified: false };
