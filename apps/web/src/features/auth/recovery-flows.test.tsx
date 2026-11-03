import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ada, problem, renderApp } from '@/test/render-app';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedApi = vi.mocked(api);
const INVALID_CODE = 'This OTP is invalid or has expired. Request a new one.';

beforeEach(() => {
  mockedApi.get.mockRejectedValue(problem(401)); // signed out unless a test says otherwise
});

describe('verify email (code)', () => {
  it('confirms with the code, refreshes the user and returns home without the banner', async () => {
    mockedApi.get.mockResolvedValueOnce(ada).mockResolvedValue({ ...ada, emailVerified: true });
    mockedApi.post.mockResolvedValue(undefined);
    const { user, router } = renderApp('/verify-email');

    await user.type(await screen.findByLabelText('OTP'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/verify-email', { code: '123456' }); // space removed
    expect(screen.queryByText(/Please confirm your email address/)).toBeNull();
  });

  it('checks the format before calling the API', async () => {
    mockedApi.get.mockResolvedValue(ada);
    const { user } = renderApp('/verify-email');

    await user.type(await screen.findByLabelText('OTP'), '12a');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Enter the full OTP')).toBeTruthy();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('shows the generic message for a wrong or expired code', async () => {
    mockedApi.get.mockResolvedValue(ada);
    mockedApi.post.mockRejectedValue(problem(400, { detail: INVALID_CODE }));
    const { user } = renderApp('/verify-email');

    await user.type(await screen.findByLabelText('OTP'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect((await screen.findByRole('alert')).textContent).toBe(INVALID_CODE);
    // The error belongs to the OTP boxes, and editing the OTP clears it.
    const otp = screen.getByLabelText('OTP');
    expect(otp.getAttribute('aria-invalid')).toBe('true');
    await user.type(otp, '{Backspace}');
    expect(screen.queryByText(INVALID_CODE)).toBeNull();
  });

  it('can send a new OTP', async () => {
    mockedApi.get.mockResolvedValue(ada);
    mockedApi.post.mockResolvedValue(undefined);
    const { user } = renderApp('/verify-email');

    await user.click(await screen.findByRole('button', { name: 'Resend OTP' }));
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/verify-email/resend');
    // Matches the API's 60 s mail cooldown, so a second click can't be wasted.
    expect(await screen.findByText(/Resend OTP in \d:\d\d/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend OTP' })).toBeNull();
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
    expect(await screen.findByRole('heading', { name: 'Reset password' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/forgot-password');
  });

  it('sends the OTP, then asks for it for that email with the resend countdown running', async () => {
    mockedApi.post.mockResolvedValue(undefined);
    const { user, router } = renderApp('/forgot-password');

    await user.type(await screen.findByLabelText('Email'), 'Ada@Example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/Enter the OTP sent to ada@example.com/)).toBeTruthy();
    expect(router.state.location.pathname).toBe('/reset-password');
    expect(screen.queryByLabelText('Email')).toBeNull(); // already known
    expect(screen.getByText(/Resend OTP in \d:\d\d/)).toBeTruthy(); // one was just sent
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'ada@example.com' });
  });

  it('asks for the new password only after a well-formed OTP', async () => {
    const { user } = renderApp('/reset-password');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('OTP'), '12');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Enter the full OTP')).toBeTruthy();
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('checks the new password against the policy before calling the API', async () => {
    const { user } = renderApp('/reset-password');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('OTP'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.type(await screen.findByLabelText('New password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText('At least 8 characters', { selector: '[data-slot=field-error]' })).toBeTruthy();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('goes back to the OTP step when the server rejects the OTP', async () => {
    mockedApi.post.mockRejectedValue(problem(400, { detail: INVALID_CODE }));
    const { user } = renderApp('/reset-password');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('OTP'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.type(await screen.findByLabelText('New password'), 'New-pass1!');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    // Back on the OTP step, with the server's message under the boxes.
    expect(await screen.findByText(INVALID_CODE)).toBeTruthy();
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.getByLabelText('OTP').getAttribute('aria-invalid')).toBe('true');
  });

  it('changes the password with email + OTP and sends the user to sign in', async () => {
    mockedApi.post.mockResolvedValue(undefined);
    const { user, router } = renderApp('/reset-password');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('OTP'), '654 321'); // pasted with a space
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.type(await screen.findByLabelText('New password'), 'New-pass1!');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/signin');
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/reset-password', {
      email: 'ada@example.com',
      code: '654321',
      password: 'New-pass1!',
    });
  });
});

describe('verify banner', () => {
  it('shows for an unverified user and leads to the code page', async () => {
    mockedApi.get.mockResolvedValue(ada); // emailVerified: false
    const { user, router } = renderApp('/');

    expect(await screen.findByText(/We sent an OTP/)).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Enter OTP' }));
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
