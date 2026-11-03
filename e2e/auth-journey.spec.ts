import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

const MAILPIT = 'http://localhost:8025/api/v1';
const INVALID_OTP = 'This OTP is invalid or has expired. Request a new one.';

// Fresh account per run: the dev database keeps users between runs.
const stamp = Date.now();
const email = `e2e+${stamp}@example.com`;
const password = `E2e-pass-${stamp}!`;
const newPassword = `E2e-new-${stamp}!`;

type Kind = 'verification' | 'password reset';

/**
 * Waits for a new mail of `kind` to `email` in Mailpit and returns its OTP,
 * which is the first word of the subject ("123456 is your verification code").
 * `seen` holds message ids already used, so a resend or an older mail never counts.
 */
async function otpFromMailpit(request: APIRequestContext, kind: Kind, seen: Set<string>): Promise<string> {
  let otp = '';
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search`, { params: { query: `to:"${email}"` } });
        const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
        const mail = messages.find((m) => !seen.has(m.ID) && m.Subject.endsWith(`is your ${kind} code`));
        if (!mail) return false;
        seen.add(mail.ID);
        otp = mail.Subject.split(' ')[0]!;
        return true;
      },
      { message: `a ${kind} mail to ${email}`, timeout: 15_000 },
    )
    .toBe(true);
  return otp;
}

const welcome = (page: Page) => page.getByRole('heading', { name: 'Welcome to the application.' });

test('sign up → verify with OTP → sign out → reset password in two steps → sign in', async ({ page, request }) => {
  const seen = new Set<string>();

  await test.step('sign up lands on the welcome page with the verify notice', async () => {
    await page.goto('/signup');
    await page.getByLabel('Name').fill('E2E Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(welcome(page)).toBeVisible();
    await expect(page.getByText(/Please confirm your email address/)).toBeVisible();
  });

  await test.step('the OTP from the mail confirms the email', async () => {
    await page.getByRole('link', { name: 'Enter OTP' }).click();
    await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();

    await page.getByLabel('OTP').fill(await otpFromMailpit(request, 'verification', seen));
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(welcome(page)).toBeVisible();
    await expect(page.getByText(/Please confirm your email address/)).toHaveCount(0);
  });

  await test.step('the session lives only in httpOnly cookies', async () => {
    expect(await page.evaluate(() => document.cookie)).toBe('');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'theme'))).toEqual([]);
    const cookies = await page.context().cookies();
    for (const name of ['__Host-access_token', '__Host-refresh_token']) {
      const cookie = cookies.find((c) => c.name === name);
      expect(cookie, name).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
    }
  });

  await test.step('sign out', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  await test.step('forgot password sends an OTP and opens the OTP step', async () => {
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(`Enter the OTP sent to ${email}.`, { exact: false })).toBeVisible();
    await expect(page.getByText(/Resend OTP in \d:\d\d/)).toBeVisible();
  });

  const resetOtp = await otpFromMailpit(request, 'password reset', seen);

  await test.step('a wrong OTP comes back from the server and returns to the OTP step', async () => {
    const wrong = resetOtp === '000000' ? '111111' : '000000';
    await page.getByLabel('OTP').fill(wrong);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.getByLabel('New password').fill(newPassword);
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page.getByText(INVALID_OTP)).toBeVisible();
    await expect(page.getByLabel('OTP')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('New password')).toHaveCount(0);
  });

  await test.step('the right OTP and a new password reset it', async () => {
    await page.getByLabel('OTP').fill(resetOtp);
    await expect(page.getByText(INVALID_OTP)).toHaveCount(0); // editing clears the error
    await page.getByRole('button', { name: 'Confirm' }).click();
    // The password is kept from the first try; submit again.
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Password reset. Sign in with your new password.')).toBeVisible();
  });

  await test.step('the old password fails with the generic message; the new one works', async () => {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(welcome(page)).toBeVisible();
  });
});

test('protected and unknown pages', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin$/); // signed out: home sends you to sign in

  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page).toHaveURL(/\/signin$/);
});
