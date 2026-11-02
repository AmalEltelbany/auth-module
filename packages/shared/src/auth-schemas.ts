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
  .max(100, 'Name is too long');

// Every failing rule is reported, so the UI can show them all at once.
export const passwordSchema = passwordRules.reduce(
  (schema, rule) => schema.refine(rule.test, rule.label),
  z.string().max(PASSWORD_MAX_LENGTH, 'Password is too long'),
);

const tokenSchema = z.string().min(1, 'Missing token');

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

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const resetPasswordSchema = z
  .object({ token: tokenSchema, password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    path: ['confirm'],
    message: 'Passwords don’t match',
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
