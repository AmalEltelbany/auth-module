import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ada, problem, renderApp } from '@/test/render-app';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedApi = vi.mocked(api);
const INVALID_CODE = 'This code is invalid or has expired. Request a new one.';

beforeEach(() => {
  mockedApi.get.mockRejectedValue(problem(401)); // signed out unless a test says otherwise
});

describe('verify email (code)', () => {
  it('confirms with the code, refreshes the user and returns home without the banner', async () => {
    mockedApi.get.mockResolvedValueOnce(ada).mockResolvedValue({ ...ada, emailVerified: true });
    mockedApi.post.mockResolvedValue(undefined);
    const { user, router } = renderApp('/verify-email');

    await user.type(await screen.findByLabelText('6-digit code'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Confirm email' }));

    expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/verify-email', { code: '123456' }); // space removed
    expect(screen.queryByText(/Please confirm your email address/)).toBeNull();
  });

  it('checks the format before calling the API', async () => {
    mockedApi.get.mockResolvedValue(ada);
    const { user } = renderApp('/verify-email');

    await user.type(await screen.findByLabelText('6-digit code'), '12a');
    await user.click(screen.getByRole('button', { name: 'Confirm email' }));

    expect(await screen.findByText('Enter the 6-digit code')).toBeTruthy();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('shows the generic message for a wrong or expired code', async () => {
    mockedApi.get.mockResolvedValue(ada);
    mockedApi.post.mockRejectedValue(problem(400, { detail: INVALID_CODE }));
    const { user } = renderApp('/verify-email');

    await user.type(await screen.findByLabelText('6-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirm email' }));

    expect((await screen.findByRole('alert')).textContent).toBe(INVALID_CODE);
  });

  it('can send a new code', async () => {
    mockedApi.get.mockResolvedValue(ada);
    mockedApi.post.mockResolvedValue(undefined);
    const { user } = renderApp('/verify-email');

    await user.click(await screen.findByRole('button', { name: 'Didn’t get it? Send a new code' }));
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/verify-email/resend');
  });

  it('is only for signed-in users', async () => {
    const { router } = renderApp('/verify-email');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/signin');
  });
});

describe('forgot → reset password (code)', () => {
  it('is reachable from the sign-in page', async () => {
    const { user, router } = renderApp('/signin');
    await user.click(await screen.findByRole('link', { name: 'Forgot password?' }));
    expect(await screen.findByRole('heading', { name: 'Forgot your password?' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/forgot-password');
  });

  it('sends the code, then asks for it with the email filled in and a generic message', async () => {
    mockedApi.post.mockResolvedValue(undefined);
    const { user, router } = renderApp('/forgot-password');

    await user.type(await screen.findByLabelText('Email'), 'Ada@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/reset-password');
    expect(screen.getByText(/If an account exists for ada@example.com/)).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@example.com');
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'ada@example.com' });
  });

  it('flags a mismatched confirmation before calling the API', async () => {
    const { user } = renderApp('/reset-password');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'New-pass1!');
    await user.type(screen.getByLabelText('Confirm new password'), 'New-pass2!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Passwords don’t match')).toBeTruthy();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('changes the password with email + code and sends the user to sign in', async () => {
    mockedApi.post.mockResolvedValue(undefined);
    const { user, router } = renderApp('/reset-password');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('6-digit code'), '654321');
    await user.type(screen.getByLabelText('New password'), 'New-pass1!');
    await user.type(screen.getByLabelText('Confirm new password'), 'New-pass1!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/signin');
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/reset-password', {
      email: 'ada@example.com',
      code: '654321',
      password: 'New-pass1!',
      confirm: 'New-pass1!',
    });
  });
});

describe('verify banner', () => {
  it('shows for an unverified user and leads to the code page', async () => {
    mockedApi.get.mockResolvedValue(ada); // emailVerified: false
    const { user, router } = renderApp('/');

    expect(await screen.findByText(/We sent a 6-digit code/)).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Enter code' }));
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/verify-email');
  });

  it('is hidden once verified', async () => {
    mockedApi.get.mockResolvedValue({ ...ada, emailVerified: true });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome to the application.' });
    expect(screen.queryByText(/Please confirm your email address/)).toBeNull();
  });
});
