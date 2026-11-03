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

  it('does not sign the user out when the API is briefly unreachable (502), it retries', async () => {
    mockedApi.get.mockRejectedValueOnce(problem(502)).mockResolvedValue(ada);
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
    expect(mockedApi.get).toHaveBeenCalledTimes(2);
  });

  it('shows a not-found page with a way home for an unknown path', async () => {
    mockedApi.get.mockRejectedValue(problem(401));
    renderApp('/no-such-page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go home' }).getAttribute('href')).toBe('/');
  });

  it('the theme switcher sets System, Light or Dark and remembers the choice', async () => {
    mockedApi.get.mockRejectedValue(problem(401));
    const { user } = renderApp('/signin');

    expect((await screen.findByRole('button', { name: 'System theme' })).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Light theme' }));
    expect(localStorage.getItem('theme')).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'System theme' }));
    expect(localStorage.getItem('theme')).toBeNull(); // back to System
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

describe('sign out', () => {
  it('ends the session and returns to sign in', async () => {
    mockedApi.get.mockResolvedValue(ada);
    mockedApi.post.mockResolvedValue(undefined);
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/logout');
  });
});
