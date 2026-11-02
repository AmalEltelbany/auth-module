import { describe, expect, it } from 'vitest';
import { passwordSchema } from './auth-schemas.js';

describe('passwordSchema', () => {
  it.each([
    ['Passw0rd!', true],
    ['password1!', true],
    ['Password!', false], // no number
    ['12345678!', false], // no letter
    ['Passw0rd', false], // no special character
    ['Pa0!', false], // too short
    ['a1!' + 'x'.repeat(126), false], // 129 chars, too long
    ['pässw0rd!', true], // "ä" is a letter
    ['ÄÖÜ12345!', true], // non-ASCII letters only
    ['1234567ä8', false], // "ä" is not special
    ['abcd 1234', false], // a space is not special
    ['abcd 123!', true], // spaces are allowed alongside a real special
  ])('%s → %s', (pw, ok) => {
    expect(passwordSchema.safeParse(pw).success).toBe(ok);
  });

  it('reports every failing rule, not just the first', () => {
    const result = passwordSchema.safeParse('abc');
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'At least 8 characters',
      'One number',
      'One special character',
    ]);
  });
});
