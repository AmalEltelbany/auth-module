import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, passwordRules } from './password-rules.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email'));

export const nameSchema = z
  .string()
  .trim()
  .min(3, 'Name must be at least 3 characters')
  .max(100, 'Name is too long')
  // No newlines or other control characters: names end up in UIs and logs.
  .regex(/^\P{Cc}*$/u, 'Name contains invalid characters');

// Every failing rule is reported, so the UI can show them all at once.
export const passwordSchema = passwordRules.reduce(
  (schema, rule) => schema.refine(rule.test, rule.label),
  z.string().max(PASSWORD_MAX_LENGTH, 'Password is too long'),
);

export const OTP_LENGTH = 6;

// The one-time code from the email. Spaces are tolerated ("123 456" pasted from a mail).
export const codeSchema = z
  .string()
  .transform((s) => s.replace(/\s/g, ''))
  .pipe(z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), 'Enter the full OTP'));

export const signUpSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});

// Sign-in only checks presence: strength rules here would lock out existing accounts.
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const verifyEmailSchema = z.object({ code: codeSchema });

// The email identifies whose code it is: codes are short and can repeat across users.
// No "confirm password" field: the show-password toggle catches typos, and
// typing it twice is friction (web.dev sign-up/sign-in form guidance).
export const resetPasswordSchema = z.object({ email: emailSchema, code: codeSchema, password: passwordSchema });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
