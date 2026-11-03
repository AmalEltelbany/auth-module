import { describe, expect, it } from 'vitest';
import {
  codeSchema,
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
    ['José Núñez', true],
    ['Ada\nCall +1 555 0100 now', false], // newline: injected "message"
    ['Ada\u0000Lovelace', false], // control character
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

describe('codeSchema', () => {
  it.each([
    ['123456', '123456'],
    ['123 456', '123456'], // pasted with a space
    [' 012345 ', '012345'], // leading zero kept
  ])('%j → %j', (input, output) => {
    expect(codeSchema.parse(input)).toBe(output);
  });

  it.each(['12345', '1234567', '12a456', ''])('rejects %j', (input) => {
    expect(codeSchema.safeParse(input).error?.issues[0]?.message).toBe('Enter the 6-digit code');
  });
});

describe('resetPasswordSchema', () => {
  it('flags a mismatched confirmation on the confirm field', () => {
    const result = resetPasswordSchema.safeParse({
      email: 'a@b.co',
      code: '123456',
      password: 'Passw0rd!',
      confirm: 'Passw0rd?',
    });
    expect(result.error?.issues.find((i) => i.path[0] === 'confirm')?.message).toBe(
      'Passwords don’t match',
    );
  });
});
