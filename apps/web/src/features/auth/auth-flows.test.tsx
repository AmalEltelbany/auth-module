import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ada, problem, renderApp } from '@/test/render-app';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedApi = vi.mocked(api);

describe('route guards', () => {
  it('shows a spinner while the session is being checked', () => {
    mockedApi.get.mockReturnValue(new Promise(() => {})); // never settles
    renderApp('/');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
  });

  it('sends a signed-out visitor from / to sign in', async () => {
    mockedApi.get.mockRejectedValue(problem(401));
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/signin');
  });

  it('sends a signed-in user away from the sign-in page', async () => {
    mockedApi.get.mockResolvedValue(ada);
    renderApp('/signin');
    expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeTruthy();
  });
});

describe('sign in', () => {
  it('shows the generic credentials error above the button', async () => {
    mockedApi.get.mockRejectedValue(problem(401));
    mockedApi.post.mockRejectedValue(problem(401, { detail: 'Invalid email or password' }));
    const { user } = renderApp('/signin');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password');
  });

  it('returns to the page the user originally asked for', async () => {
    mockedApi.get.mockRejectedValue(problem(401));
    mockedApi.post.mockResolvedValue(ada);
    const { user, router } = renderApp('/'); // redirected to /signin, remembering "/"

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('log out', () => {
  it('ends the session and returns to sign in', async () => {
    mockedApi.get.mockResolvedValue(ada);
    mockedApi.post.mockResolvedValue(undefined);
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/logout');
  });
});
