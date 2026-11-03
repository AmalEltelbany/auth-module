import { describe, expect, it, vi } from 'vitest';
import { problem } from '@/test/render-app';
import { applyServerErrors, isOtpRejected } from './form-errors';

describe('isOtpRejected', () => {
  it.each([
    ['400 without field errors (wrong, expired or used OTP)', problem(400, { detail: 'invalid' }), true],
    ['400 with field errors (e.g. a breached password)', problem(400, { errors: [{ path: 'password', message: 'x' }] }), false],
    ['429 (throttled)', problem(429), false],
    ['network error (status 0)', problem(0), false],
    ['not an ApiError', new Error('boom'), false],
  ])('%s → %s', (_, error, rejected) => {
    expect(isOtpRejected(error)).toBe(rejected);
  });
});

describe('applyServerErrors', () => {
  it('puts each field error under its field and focuses it', () => {
    const setError = vi.fn();
    applyServerErrors(problem(409, { errors: [{ path: 'email', message: 'Taken' }] }), setError);
    expect(setError).toHaveBeenCalledExactlyOnceWith('email', { message: 'Taken' }, { shouldFocus: true });
  });

  it('puts an error without fields above the button, with the server’s message', () => {
    const setError = vi.fn();
    applyServerErrors(problem(401, { detail: 'Invalid email or password' }), setError);
    expect(setError).toHaveBeenCalledExactlyOnceWith('root.server', { message: 'Invalid email or password' });
  });

  it('never shows a raw exception message for a non-API error', () => {
    const setError = vi.fn();
    applyServerErrors(new TypeError('x is undefined'), setError);
    expect(setError).toHaveBeenCalledExactlyOnceWith('root.server', { message: 'Something went wrong. Please try again.' });
  });
});
