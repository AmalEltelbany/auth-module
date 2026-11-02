// Single source of the password policy: the API validates with it, and the web
// app renders it as a live checklist.

export const PASSWORD_MIN_LENGTH = 8; // task spec; NIST 800-63B rev 4 asks 15 for single-factor
export const PASSWORD_MAX_LENGTH = 128; // bounds argon2 work per request

export type PasswordRule = {
  id: 'length' | 'letter' | 'number' | 'special';
  label: string;
  test: (password: string) => boolean;
};

export const passwordRules: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'letter',
    label: 'One letter',
    // Unicode-aware: "ä", "é", "ж" are letters, not special characters.
    test: (p) => /\p{L}/u.test(p),
  },
  {
    id: 'number',
    label: 'One number',
    test: (p) => /\p{N}/u.test(p),
  },
  {
    id: 'special',
    label: 'One special character',
    // Anything that isn't a letter, number or whitespace. Spaces are allowed in
    // passwords but don't satisfy this rule, since users rarely see them as "special".
    test: (p) => /[^\p{L}\p{N}\s]/u.test(p),
  },
];
