import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  nameSchema,
  resetPasswordSchema,
  signInSchema,
} from './auth-schemas.js';

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Bob@Example.COM ')).toBe('bob@example.com');
  });

  it.each(['', 'bob', 'bob@', '@example.com', 'bob@example'])('rejects %j', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(false);
  });
});

describe('nameSchema', () => {
  it.each([
    ['Al', false],
    ['Ali', true],
    ['  Al  ', false], // trimmed before the length check
  ])('%j → %s', (name, ok) => {
    expect(nameSchema.safeParse(name).success).toBe(ok);
  });
});

describe('signInSchema', () => {
  it('accepts a weak password: strength is only checked at sign-up', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('requires a password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('flags a mismatched confirmation on the confirm field', () => {
    const result = resetPasswordSchema.safeParse({
      token: 't',
      password: 'Passw0rd!',
      confirm: 'Passw0rd?',
    });
    expect(result.error?.issues.find((i) => i.path[0] === 'confirm')?.message).toBe(
      'Passwords don’t match',
    );
  });
});
