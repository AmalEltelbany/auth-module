import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ada, problem, renderApp } from '@/test/render-app';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedApi = vi.mocked(api);

beforeEach(() => {
  mockedApi.get.mockRejectedValue(problem(401)); // signed out unless a test says otherwise
});

describe('verify email page', () => {
  // Pinned: the verify page sends no request until the button is clicked.
  it('sends nothing on load, strips the token from the URL, and confirms on click', async () => {
    mockedApi.post.mockResolvedValue(undefined);
    const { user, router } = renderApp('/verify-email#token=abc123');

    const button = await screen.findByRole('button', { name: 'Confirm my email' });
    expect(mockedApi.post).not.toHaveBeenCalled();
    expect(router.state.location.hash).toBe('');

    await user.click(button);
    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeTruthy();
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/verify-email', { token: 'abc123' });
  });

  it('shows the API message for a dead link', async () => {
    mockedApi.post.mockRejectedValue(problem(400, { detail: 'This link is invalid or has expired. Request a new one.' }));
    const { user } = renderApp('/verify-email#token=used');

    await user.click(await screen.findByRole('button', { name: 'Confirm my email' }));
    expect((await screen.findByRole('alert')).textContent).toBe('This link is invalid or has expired. Request a new one.');
  });

  it('explains a link without a token instead of sending anything', async () => {
    renderApp('/verify-email');
    expect(await screen.findByText(/This link is incomplete/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm my email' })).toBeNull();
  });
});

describe('forgot password page', () => {
  it('shows the same "check your email" answer the API gives for every address', async () => {
    mockedApi.post.mockResolvedValue(undefined);
    const { user } = renderApp('/forgot-password');

    await user.type(await screen.findByLabelText('Email'), 'Ada@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy();
    expect(screen.getByText(/If an account exists for ada@example.com/)).toBeTruthy();
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'ada@example.com' });
  });

  it('is reachable from the sign-in page', async () => {
    const { user, router } = renderApp('/signin');
    await user.click(await screen.findByRole('link', { name: 'Forgot password?' }));
    expect(await screen.findByRole('heading', { name: 'Forgot your password?' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/forgot-password');
  });
});

describe('reset password page', () => {
  it('flags a mismatched confirmation before calling the API', async () => {
    const { user } = renderApp('/reset-password#token=t0k');

    await user.type(await screen.findByLabelText('New password'), 'New-pass1!');
    await user.type(screen.getByLabelText('Confirm new password'), 'New-pass2!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Passwords don’t match')).toBeTruthy();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('changes the password with the link token and sends the user to sign in', async () => {
    mockedApi.post.mockResolvedValue(undefined);
    const { user, router } = renderApp('/reset-password#token=t0k');

    await user.type(await screen.findByLabelText('New password'), 'New-pass1!');
    await user.type(screen.getByLabelText('Confirm new password'), 'New-pass1!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/signin');
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/reset-password', {
      token: 't0k',
      password: 'New-pass1!',
      confirm: 'New-pass1!',
    });
  });
});

describe('verify banner', () => {
  it('shows for an unverified user and resends the link', async () => {
    mockedApi.get.mockResolvedValue(ada); // emailVerified: false
    mockedApi.post.mockResolvedValue(undefined);
    const { user } = renderApp('/');

    expect(await screen.findByText(/Please confirm your email address/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Resend' }));
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/verify-email/resend');
  });

  it('is hidden once verified', async () => {
    mockedApi.get.mockResolvedValue({ ...ada, emailVerified: true });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome to the application.' });
    expect(screen.queryByText(/Please confirm your email address/)).toBeNull();
  });
});
