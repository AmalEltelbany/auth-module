import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const ACCESS_COOKIE = '__Host-access_token';
const REFRESH_COOKIE = '__Host-refresh_token';
const valid = { email: 'Ada@Example.com', name: 'Ada Lovelace', password: 'Passw0rd!' };

let app: INestApplication;
let replSet: MongoMemoryReplSet;
let http: ReturnType<typeof request>;

// Records mail instead of sending it, so tests can use the codes the API sent.
type Mail = { kind: 'verify' | 'reset' | 'changed'; to: string; code?: string };
const outbox: Mail[] = [];
const recordingMail = {
  sendVerificationCode: async (to: string, code: string) => void outbox.push({ kind: 'verify', to, code }),
  sendPasswordResetCode: async (to: string, code: string) => void outbox.push({ kind: 'reset', to, code }),
  sendPasswordChanged: async (to: string) => void outbox.push({ kind: 'changed', to }),
};
const mailsTo = (to: string, kind: Mail['kind']) => outbox.filter((m) => m.to === to && m.kind === kind);

/** Waits for the (fire-and-forget) mail, then returns its code. */
async function codeFromMail(to: string, kind: 'verify' | 'reset'): Promise<string> {
  const mail = await vi.waitFor(() => {
    const last = mailsTo(to, kind).at(-1);
    if (!last) throw new Error(`no ${kind} mail to ${to} yet`);
    return last;
  });
  return mail.code!;
}

/** A code guaranteed to differ from `code`. */
const wrong = (code: string) => (code === '000000' ? '111111' : '000000');
const INVALID_CODE = 'This OTP is invalid or has expired. Request a new one.';
const BREACHED_PASSWORD = 'Breached-pass1!';
const BREACHED_MESSAGE = 'This password has appeared in a data breach. Choose a different one.';

/** Lets fire-and-forget work finish, for asserting that nothing was sent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

/** The full Set-Cookie header for `name`. */
function setCookie(res: request.Response, name: string): string {
  const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  expect(header, `${name} cookie`).toBeDefined();
  return header!;
}

/** The `name=value` pair of a cookie, ready to send back. */
const cookie = (res: request.Response, name: string) => setCookie(res, name).split(';')[0]!;
const sessionCookie = (res: request.Response) => cookie(res, ACCESS_COOKIE);

async function signIn() {
  const res = await http.post('/api/auth/signin').send({ email: valid.email, password: valid.password }).expect(200);
  return { access: cookie(res, ACCESS_COOKIE), refresh: cookie(res, REFRESH_COOKIE) };
}

beforeAll(async () => {
  // Replica set, not a standalone server: password reset runs in a transaction.
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = replSet.getUri('auth-e2e');
  process.env.JWT_ACCESS_SECRET = 'e2e-secret-that-is-at-least-32-characters';
  process.env.NODE_ENV = 'test';

  // Imported after the env is set: config.ts parses it on first import.
  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/setup.js');
  const { MailService } = await import('../src/mail/mail.service.js');
  const { BreachedPasswordsService } = await import('../src/auth/breached-passwords.service.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(recordingMail)
    // No network in tests: one known "breached" password instead of the HIBP API.
    .overrideProvider(BreachedPasswordsService)
    .useValue({ isBreached: async (password: string) => password === BREACHED_PASSWORD })
    .compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
  await replSet?.stop();
});

describe('POST /api/auth/signup', () => {
  it('creates the user, sets a hardened session cookie and never returns the hash', async () => {
    const res = await http.post('/api/auth/signup').send(valid).expect(201);

    expect(res.body).toEqual({ id: expect.any(String), email: 'ada@example.com', name: 'Ada Lovelace', emailVerified: false });
    // Pinned: passwordHash never appears in any response.
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);

    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(ACCESS_COOKIE))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Max-Age=900/);
  });

  it('rejects a taken email (any case) with 409 on the email field', async () => {
    const res = await http.post('/api/auth/signup').send({ ...valid, email: 'ADA@example.com' }).expect(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.errors).toEqual([{ path: 'email', message: 'Email is already registered' }]);
  });

  it('returns field errors as problem details', async () => {
    const res = await http
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', name: 'Al', password: 'short' })
      .expect(400);

    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 400, title: 'Bad Request' });
    const paths = res.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'name', 'password']));
  });
});

describe('POST /api/auth/signin', () => {
  it('signs in with the right password', async () => {
    const res = await http.post('/api/auth/signin').send({ email: valid.email, password: valid.password }).expect(200);
    expect(res.body.email).toBe('ada@example.com');
    sessionCookie(res);
  });

  it('gives the same generic 401 for a wrong password and an unknown email', async () => {
    const wrong = await http.post('/api/auth/signin').send({ email: valid.email, password: 'Wrong-pass1' }).expect(401);
    const unknown = await http.post('/api/auth/signin').send({ email: 'nobody@example.com', password: 'Wrong-pass1' }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.detail).toBe('Invalid email or password');
  });
});

describe('protected routes', () => {
  it('GET /api/users/me returns the user for a valid session', async () => {
    const signin = await http.post('/api/auth/signin').send({ email: valid.email, password: valid.password });
    const res = await http.get('/api/users/me').set('Cookie', sessionCookie(signin)).expect(200);
    expect(res.body).toMatchObject({ email: 'ada@example.com', name: 'Ada Lovelace' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);
  });

  it('rejects a missing or forged session', async () => {
    await http.get('/api/users/me').expect(401);
    await http.get('/api/users/me').set('Cookie', `${ACCESS_COOKIE}=not.a.jwt`).expect(401);
  });

  it('POST /api/auth/logout clears the cookie', async () => {
    const signin = await http.post('/api/auth/signin').send({ email: valid.email, password: valid.password });
    const res = await http.post('/api/auth/logout').set('Cookie', sessionCookie(signin)).expect(204);
    expect(sessionCookie(res)).toBe(`${ACCESS_COOKIE}=`);
  });
});

describe('refresh tokens', () => {
  it('are __Host- cookies: httpOnly, Secure, Path=/ and no Domain, so subdomains can’t plant them', async () => {
    const res = await http.post('/api/auth/signin').send({ email: valid.email, password: valid.password }).expect(200);
    const header = setCookie(res, REFRESH_COOKIE);
    expect(header).toMatch(/Path=\/(;|$)/);
    expect(header).not.toMatch(/Domain=/i);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Strict/i);
    expect(header).toMatch(/Max-Age=604800/);
  });

  it('rotate: refresh returns new cookies and the new access token works', async () => {
    const first = await signIn();
    const res = await http.post('/api/auth/refresh').set('Cookie', first.refresh).expect(200);

    const next = { access: cookie(res, ACCESS_COOKIE), refresh: cookie(res, REFRESH_COOKIE) };
    expect(next.refresh).not.toBe(first.refresh);
    expect(res.body.email).toBe('ada@example.com');
    await http.get('/api/users/me').set('Cookie', next.access).expect(200);
  });

  // Pinned: reusing a used refresh token revokes the family.
  it('treats a replayed refresh token as theft and revokes the whole family', async () => {
    const { refresh: stolen } = await signIn();
    const legit = await http.post('/api/auth/refresh').set('Cookie', stolen).expect(200);
    const legitRefresh = cookie(legit, REFRESH_COOKIE);

    await http.post('/api/auth/refresh').set('Cookie', stolen).expect(401); // the replay
    await http.post('/api/auth/refresh').set('Cookie', legitRefresh).expect(401); // family is gone too
  });

  it('rejects a missing or unknown token and clears both cookies', async () => {
    await http.post('/api/auth/refresh').expect(401);
    const res = await http.post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=forged`).expect(401);
    expect(cookie(res, ACCESS_COOKIE)).toBe(`${ACCESS_COOKIE}=`);
    expect(cookie(res, REFRESH_COOKIE)).toBe(`${REFRESH_COOKIE}=`);
  });

  it('dies when the user’s sessionVersion moves on (what a password reset does)', async () => {
    const { access, refresh } = await signIn();
    const users = app.get<Model<{ email: string; sessionVersion: number }>>(getModelToken('UserRecord'));
    await users.updateOne({ email: 'ada@example.com' }, { $inc: { sessionVersion: 1 } });

    await http.get('/api/users/me').set('Cookie', access).expect(401); // old access token
    await http.post('/api/auth/refresh').set('Cookie', refresh).expect(401); // old refresh token
    await signIn(); // a fresh sign-in still works
  });

  it('logout revokes this device only', async () => {
    const thisDevice = await signIn();
    const otherDevice = await signIn();

    await http.post('/api/auth/logout').set('Cookie', thisDevice.refresh).expect(204);

    await http.post('/api/auth/refresh').set('Cookie', thisDevice.refresh).expect(401);
    await http.post('/api/auth/refresh').set('Cookie', otherDevice.refresh).expect(200);
  });
});

async function signUpAs(email: string, password = 'Passw0rd!') {
  const res = await http.post('/api/auth/signup').send({ email, name: 'Test User', password }).expect(201);
  return { access: cookie(res, ACCESS_COOKIE), refresh: cookie(res, REFRESH_COOKIE) };
}

describe('email verification (6-digit code)', () => {
  it('sign-up emails a 6-digit code', async () => {
    await signUpAs('grace@example.com');
    expect(await codeFromMail('grace@example.com', 'verify')).toMatch(/^\d{6}$/);
  });

  it('verifies the signed-in user with the code, exactly once', async () => {
    const { access } = await signUpAs('hopper@example.com');
    const code = await codeFromMail('hopper@example.com', 'verify');

    await http.post('/api/auth/verify-email').set('Cookie', access).send({ code }).expect(204);
    expect((await http.get('/api/users/me').set('Cookie', access)).body.emailVerified).toBe(true);
  });

  it('needs a session: a code alone verifies nobody', async () => {
    await http.post('/api/auth/verify-email').send({ code: '123456' }).expect(401);
  });

  it('rejects a wrong code with the generic message', async () => {
    const { access } = await signUpAs('lovelace@example.com');
    const code = await codeFromMail('lovelace@example.com', 'verify');
    const res = await http.post('/api/auth/verify-email').set('Cookie', access).send({ code: wrong(code) }).expect(400);
    expect(res.body.detail).toBe(INVALID_CODE);
  });

  // Pinned: a code is dead after 5 wrong attempts.
  it('kills the code after 5 wrong attempts, even if the 6th is right', async () => {
    const { access } = await signUpAs('dijkstra@example.com');
    const code = await codeFromMail('dijkstra@example.com', 'verify');

    for (let i = 0; i < 5; i++) {
      await http.post('/api/auth/verify-email').set('Cookie', access).send({ code: wrong(code) }).expect(400);
    }
    await http.post('/api/auth/verify-email').set('Cookie', access).send({ code }).expect(400);
  });

  it('resend needs a session, and sends nothing once verified', async () => {
    await http.post('/api/auth/verify-email/resend').expect(401);

    const { access } = await signUpAs('lamarr@example.com');
    const code = await codeFromMail('lamarr@example.com', 'verify');
    await http.post('/api/auth/verify-email').set('Cookie', access).send({ code }).expect(204);
    await http.post('/api/auth/verify-email/resend').set('Cookie', access).expect(202);
    await settle();
    expect(mailsTo('lamarr@example.com', 'verify')).toHaveLength(1);
  });

  it('resend (after the cooldown) sends a new code and kills the old one', async () => {
    const { access } = await signUpAs('turing@example.com');
    const first = await codeFromMail('turing@example.com', 'verify');
    // Move the 60 s per-account mail cooldown into the past.
    const users = app.get<Model<unknown>>(getModelToken('UserRecord'));
    await users.updateOne({ email: 'turing@example.com' }, { 'mailSentAt.verify': new Date(Date.now() - 120_000) });

    await http.post('/api/auth/verify-email/resend').set('Cookie', access).expect(202);
    await vi.waitFor(() => expect(mailsTo('turing@example.com', 'verify')).toHaveLength(2));
    const second = await codeFromMail('turing@example.com', 'verify');

    if (first !== second) await http.post('/api/auth/verify-email').set('Cookie', access).send({ code: first }).expect(400);
    await http.post('/api/auth/verify-email').set('Cookie', access).send({ code: second }).expect(204);
  });

  it('a burst of resends sends at most one email (atomic cooldown)', async () => {
    const { access } = await signUpAs('shannon@example.com');
    await codeFromMail('shannon@example.com', 'verify'); // the sign-up mail claimed the slot
    const users = app.get<Model<unknown>>(getModelToken('UserRecord'));
    await users.updateOne({ email: 'shannon@example.com' }, { 'mailSentAt.verify': new Date(Date.now() - 120_000) });

    await Promise.all([1, 2, 3].map(() => http.post('/api/auth/verify-email/resend').set('Cookie', access)));
    await settle();
    expect(mailsTo('shannon@example.com', 'verify')).toHaveLength(2); // sign-up + exactly one resend
  });

  it('the verification email contains no user-supplied text', async () => {
    await http
      .post('/api/auth/signup')
      .send({ email: 'victim@example.com', name: 'Call +1 555 0100 to unlock', password: 'Passw0rd!' })
      .expect(201);
    await codeFromMail('victim@example.com', 'verify');
    expect(Object.keys(mailsTo('victim@example.com', 'verify')[0]!)).toEqual(['kind', 'to', 'code']);
  });
});

describe('password reset (6-digit code)', () => {
  // Pinned: forgot-password returns 202 for unknown emails and when throttled.
  it('forgot-password answers 202 for an unknown email and sends nothing', async () => {
    await http.post('/api/auth/forgot-password').send({ email: 'nobody@example.com' }).expect(202);
    await settle();
    expect(mailsTo('nobody@example.com', 'reset')).toHaveLength(0);
  });

  it('a second request within the cooldown still answers 202 but sends nothing', async () => {
    await signUpAs('knuth@example.com');
    await http.post('/api/auth/forgot-password').send({ email: 'knuth@example.com' }).expect(202);
    await codeFromMail('knuth@example.com', 'reset');

    await http.post('/api/auth/forgot-password').send({ email: 'KNUTH@example.com' }).expect(202);
    await settle();
    expect(mailsTo('knuth@example.com', 'reset')).toHaveLength(1);
  });

  // Pinned: after a reset, old sessions and the old password fail.
  it('resets the password, signs out every device, and the code works once', async () => {
    const laptop = await signUpAs('liskov@example.com', 'Old-pass1!');
    const phone = await http.post('/api/auth/signin').send({ email: 'liskov@example.com', password: 'Old-pass1!' }).expect(200);
    await http.post('/api/auth/forgot-password').send({ email: 'liskov@example.com' }).expect(202);
    const code = await codeFromMail('liskov@example.com', 'reset');

    const reset = { email: 'liskov@example.com', code, password: 'New-pass1!' };
    await http.post('/api/auth/reset-password').send(reset).expect(204);

    await http.get('/api/users/me').set('Cookie', laptop.access).expect(401); // old access token
    await http.post('/api/auth/refresh').set('Cookie', laptop.refresh).expect(401); // old refresh, device 1
    await http.post('/api/auth/refresh').set('Cookie', cookie(phone, REFRESH_COOKIE)).expect(401); // device 2
    await http.post('/api/auth/signin').send({ email: 'liskov@example.com', password: 'Old-pass1!' }).expect(401);
    const fresh = await http.post('/api/auth/signin').send({ email: 'liskov@example.com', password: 'New-pass1!' }).expect(200);
    expect(fresh.body.emailVerified).toBe(true); // owning the inbox proves the address

    await http.post('/api/auth/reset-password').send({ ...reset, password: 'Other-pass1!' }).expect(400);
    await vi.waitFor(() => expect(mailsTo('liskov@example.com', 'changed')).toHaveLength(1));
  });

  // Pinned: unknown email and wrong code look identical.
  it('gives the same answer for an unknown email and a wrong code', async () => {
    await signUpAs('hoare@example.com');
    await http.post('/api/auth/forgot-password').send({ email: 'hoare@example.com' }).expect(202);
    const code = await codeFromMail('hoare@example.com', 'reset');

    const body = { password: 'New-pass1!' };
    const unknown = await http.post('/api/auth/reset-password').send({ ...body, email: 'ghost@example.com', code }).expect(400);
    const wrongCode = await http.post('/api/auth/reset-password').send({ ...body, email: 'hoare@example.com', code: wrong(code) }).expect(400);
    expect(unknown.body).toEqual(wrongCode.body);
    expect(unknown.body.detail).toBe(INVALID_CODE);
  });

  it('kills the reset code after 5 wrong attempts', async () => {
    await signUpAs('codd@example.com');
    await http.post('/api/auth/forgot-password').send({ email: 'codd@example.com' }).expect(202);
    const code = await codeFromMail('codd@example.com', 'reset');
    const body = { email: 'codd@example.com', password: 'New-pass1!' };

    for (let i = 0; i < 5; i++) {
      await http.post('/api/auth/reset-password').send({ ...body, code: wrong(code) }).expect(400);
    }
    await http.post('/api/auth/reset-password').send({ ...body, code }).expect(400);
    await http.post('/api/auth/signin').send({ email: 'codd@example.com', password: 'Passw0rd!' }).expect(200); // unchanged
  });

  it('rejects a weak new password with field errors', async () => {
    const res = await http
      .post('/api/auth/reset-password')
      .send({ email: 'a@b.co', code: '123456', password: 'weak' })
      .expect(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain('password');
  });
});

describe('guessing budgets (per account, across codes and parallel requests)', () => {
  const users = () => app.get<Model<Record<string, unknown>>>(getModelToken('UserRecord'));
  const ageMailCooldown = (email: string) =>
    users().updateOne({ email }, { 'mailSentAt.reset': new Date(Date.now() - 120_000) });

  // Pinned: 10 wrong codes per account per day, however many codes are issued.
  it('requesting fresh codes does not buy more guesses: 10 wrong per day, then even the right code is refused', async () => {
    await signUpAs('lamport@example.com');
    const body = { email: 'lamport@example.com', password: 'New-pass1!' };
    // Waits for a NEW mail: the send is fire-and-forget, so "the latest mail"
    // right after the request may still be the previous (already replaced) code.
    const newCode = async () => {
      const before = mailsTo('lamport@example.com', 'reset').length;
      await ageMailCooldown('lamport@example.com');
      await http.post('/api/auth/forgot-password').send({ email: 'lamport@example.com' }).expect(202);
      await vi.waitFor(() => expect(mailsTo('lamport@example.com', 'reset')).toHaveLength(before + 1));
      return codeFromMail('lamport@example.com', 'reset');
    };

    for (let round = 0; round < 2; round++) {
      const code = await newCode();
      for (let i = 0; i < 5; i++) await http.post('/api/auth/reset-password').send({ ...body, code: wrong(code) }).expect(400);
    }

    const third = await newCode();
    await http.post('/api/auth/reset-password').send({ ...body, code: third }).expect(400); // budget spent

    // After the 24 h window the same (unspent) code works.
    await users().updateOne({ email: 'lamport@example.com' }, { codeFailuresSince: new Date(Date.now() - 25 * 3600_000) });
    await http.post('/api/auth/reset-password').send({ ...body, code: third }).expect(204);
  });

  it('parallel sign-in attempts reserve at most 5 (no race past the lockout)', async () => {
    await signUpAs('lynch@example.com');
    const { UsersService } = await import('../src/users/users.service.js');
    const service = app.get(UsersService);
    const id = String((await users().findOne({ email: 'lynch@example.com' }))!._id);

    const results = await Promise.all(Array.from({ length: 12 }, () => service.reserveLoginAttempt(id, 5)));
    expect(results.filter((r) => r !== null)).toHaveLength(5);
  });

  it('parallel code checks reserve at most 10 from the daily budget', async () => {
    await signUpAs('gray@example.com');
    const { UsersService } = await import('../src/users/users.service.js');
    const service = app.get(UsersService);
    const id = String((await users().findOne({ email: 'gray@example.com' }))!._id);

    const results = await Promise.all(Array.from({ length: 15 }, () => service.reserveCodeAttempt(id, 10, 86_400)));
    expect(results.filter(Boolean)).toHaveLength(10);
  });
});

describe('breached passwords', () => {
  it('sign-up rejects a breached password on the password field', async () => {
    const res = await http
      .post('/api/auth/signup')
      .send({ email: 'breach@example.com', name: 'Breach Test', password: BREACHED_PASSWORD })
      .expect(400);
    expect(res.body.errors).toEqual([{ path: 'password', message: BREACHED_MESSAGE }]);
  });

  it('reset rejects a breached password without burning the code', async () => {
    await signUpAs('ritchie@example.com');
    await http.post('/api/auth/forgot-password').send({ email: 'ritchie@example.com' }).expect(202);
    const code = await codeFromMail('ritchie@example.com', 'reset');

    const breached = { email: 'ritchie@example.com', code, password: BREACHED_PASSWORD };
    const res = await http.post('/api/auth/reset-password').send(breached).expect(400);
    expect(res.body.errors).toEqual([{ path: 'password', message: BREACHED_MESSAGE }]);
    await http
      .post('/api/auth/reset-password')
      .send({ ...breached, password: 'Fresh-pass1!' })
      .expect(204);
  });
});

describe('account lockout', () => {
  const signInAs = (email: string, password: string) => http.post('/api/auth/signin').send({ email, password });

  it('locks after 5 wrong passwords: the right one is refused too, with the same message', async () => {
    await signUpAs('mallory@example.com', 'Right-pass1!');
    for (let i = 0; i < 5; i++) await signInAs('mallory@example.com', 'Wrong-pass1!').expect(401);

    const locked = await signInAs('mallory@example.com', 'Right-pass1!').expect(401);
    expect(locked.body.detail).toBe('Invalid email or password'); // no "account locked" hint
  });

  it('a successful sign-in resets the count', async () => {
    await signUpAs('trent@example.com', 'Right-pass1!');
    for (let i = 0; i < 4; i++) await signInAs('trent@example.com', 'Wrong-pass1!').expect(401);
    await signInAs('trent@example.com', 'Right-pass1!').expect(200);
    for (let i = 0; i < 4; i++) await signInAs('trent@example.com', 'Wrong-pass1!').expect(401);
    await signInAs('trent@example.com', 'Right-pass1!').expect(200);
  });

  it('a password reset lifts the lock', async () => {
    await signUpAs('peggy@example.com', 'Right-pass1!');
    for (let i = 0; i < 5; i++) await signInAs('peggy@example.com', 'Wrong-pass1!').expect(401);

    await http.post('/api/auth/forgot-password').send({ email: 'peggy@example.com' }).expect(202);
    const code = await codeFromMail('peggy@example.com', 'reset');
    await http
      .post('/api/auth/reset-password')
      .send({ email: 'peggy@example.com', code, password: 'Fresh-pass1!' })
      .expect(204);
    await signInAs('peggy@example.com', 'Fresh-pass1!').expect(200);
  });
});

describe('platform', () => {
  it('GET /api/health is public', async () => {
    await http.get('/api/health').expect(200, { status: 'ok' });
  });

  it('sends security headers', async () => {
    const res = await http.get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects cross-site state-changing requests (CSRF)', async () => {
    await http.post('/api/auth/signin').set('Sec-Fetch-Site', 'cross-site').send({ email: valid.email, password: valid.password }).expect(403);
  });

  it('documents the auth endpoints in OpenAPI', async () => {
    const res = await http.get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/auth/signup', '/api/auth/signin', '/api/auth/logout', '/api/users/me']),
    );
  });
});
