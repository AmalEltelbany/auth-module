import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ada, problem, renderApp } from '@/test/render-app';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedApi = vi.mocked(api);
const BREACHED = 'This password has appeared in a data breach. Choose a different one.';

beforeEach(() => {
  mockedApi.get.mockRejectedValue(problem(401)); // signed out unless a test says otherwise
});

afterEach(() => {
  vi.useRealTimers();
});

/** Fills step 1 of the reset page and moves on to the password step. */
async function toPasswordStep(user: ReturnType<typeof renderApp>['user'], otp = '123456') {
  await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
  await user.type(screen.getByLabelText('OTP'), otp);
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
  return screen.findByLabelText('New password');
}

describe('OTP input', () => {
  it('keeps digits only, at most six, and shows one per box', async () => {
    mockedApi.get.mockResolvedValue(ada);
    const { user } = renderApp('/verify-email');

    const otp = (await screen.findByLabelText('OTP')) as HTMLInputElement;
    await user.type(otp, '12a3 45678');

    expect(otp.value).toBe('123456');
    // The boxes are decoration (aria-hidden); the one real input is what's announced.
    expect(otp.parentElement!.querySelector('[aria-hidden]')!.textContent).toBe('123456');
  });

  it('fills all six boxes from a pasted "123 456"', async () => {
    mockedApi.get.mockResolvedValue(ada);
    const { user } = renderApp('/verify-email');

    const otp = (await screen.findByLabelText('OTP')) as HTMLInputElement;
    await user.click(otp);
    await user.paste('123 456');

    expect(otp.value).toBe('123456');
  });

  it('is one field for assistive tech, with phone autofill and the numeric keypad', async () => {
    mockedApi.get.mockResolvedValue(ada);
    renderApp('/verify-email');

    const otp = await screen.findByLabelText('OTP');
    expect(screen.getAllByRole('textbox')).toEqual([otp]);
    expect(otp.getAttribute('autocomplete')).toBe('one-time-code');
    expect(otp.getAttribute('inputmode')).toBe('numeric');
  });
});

describe('resend OTP', () => {
  it('counts down from 1:00 after a resend, then offers the link again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedApi.get.mockResolvedValue(ada);
    mockedApi.post.mockResolvedValue(undefined);
    const { user } = renderApp('/verify-email');

    await user.click(await screen.findByRole('button', { name: 'Resend OTP' }));
    expect(await screen.findByText('Resend OTP in 1:00')).toBeTruthy();

    // One tick per act: each second's timer is scheduled by the previous render.
    for (let i = 0; i < 60; i++) act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: 'Resend OTP' })).toBeTruthy();
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
  });

  it('says why when sending fails, and keeps the link (no countdown)', async () => {
    mockedApi.get.mockResolvedValue(ada);
    mockedApi.post.mockRejectedValue(problem(429, { detail: 'Too many requests. Try again later.' }));
    const { user } = renderApp('/verify-email');

    await user.click(await screen.findByRole('button', { name: 'Resend OTP' }));

    expect(await screen.findByText('Too many requests. Try again later.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resend OTP' })).toBeTruthy();
    expect(screen.queryByText(/Resend OTP in/)).toBeNull();
  });
});

describe('reset password steps', () => {
  it('"Go back" from the password step keeps the email and OTP', async () => {
    const { user } = renderApp('/reset-password');
    await toPasswordStep(user, '246810');

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@example.com');
    expect((screen.getByLabelText('OTP') as HTMLInputElement).value).toBe('246810');
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('a breached password stays on the password step, under the field', async () => {
    mockedApi.post.mockRejectedValue(problem(400, { errors: [{ path: 'password', message: BREACHED }] }));
    const { user } = renderApp('/reset-password');

    await user.type(await toPasswordStep(user), 'Breached-pass1!');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText(BREACHED)).toBeTruthy();
    expect(screen.getByLabelText('New password').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('OTP').closest('[hidden]')).not.toBeNull(); // still on step 2
  });

  it('never fails silently on a field error that has no field on this step', async () => {
    // Found by the browser e2e against an outdated API that still asked for "confirm".
    mockedApi.post.mockRejectedValue(problem(400, { errors: [{ path: 'confirm', message: 'Required' }] }));
    const { user } = renderApp('/reset-password');

    await user.type(await toPasswordStep(user), 'New-pass1!');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
  });

  it('moves focus into each step as it opens', async () => {
    const { user } = renderApp('/reset-password');
    const password = await toPasswordStep(user);
    expect(document.activeElement).toBe(password);

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(document.activeElement).toBe(screen.getByLabelText('OTP'));
  });
});

describe('show / hide password', () => {
  it('reveals the password and says so, then hides it again', async () => {
    const { user } = renderApp('/signin');
    const password = (await screen.findByLabelText('Password')) as HTMLInputElement;
    await user.type(password, 'Passw0rd!');
    expect(password.type).toBe('password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.type).toBe('password');
    expect(password.value).toBe('Passw0rd!');
  });
});
