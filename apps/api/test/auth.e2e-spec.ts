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

// Records mail instead of sending it, so tests can follow the links the API built.
type Mail = { kind: 'verify' | 'reset' | 'changed'; to: string; link?: string };
const outbox: Mail[] = [];
const recordingMail = {
  sendVerification: async (to: string, _name: string, link: string) => void outbox.push({ kind: 'verify', to, link }),
  sendPasswordReset: async (to: string, link: string) => void outbox.push({ kind: 'reset', to, link }),
  sendPasswordChanged: async (to: string) => void outbox.push({ kind: 'changed', to }),
};
const mailsTo = (to: string, kind: Mail['kind']) => outbox.filter((m) => m.to === to && m.kind === kind);

/** Waits for the (fire-and-forget) mail, then returns the token from its link. */
async function tokenFromMail(to: string, kind: 'verify' | 'reset'): Promise<string> {
  const mail = await vi.waitFor(() => {
    const last = mailsTo(to, kind).at(-1);
    if (!last) throw new Error(`no ${kind} mail to ${to} yet`);
    return last;
  });
  return new URL(mail.link!).hash.replace('#token=', '');
}

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
  process.env.APP_URL = 'http://localhost:5173';
  process.env.NODE_ENV = 'test';

  // Imported after the env is set: config.ts parses it on first import.
  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/setup.js');
  const { MailService } = await import('../src/mail/mail.service.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(recordingMail)
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

describe('email verification', () => {
  it('sign-up emails a link built from APP_URL, with the token in the #fragment', async () => {
    await signUpAs('grace@example.com');
    await tokenFromMail('grace@example.com', 'verify');
    expect(mailsTo('grace@example.com', 'verify')[0]!.link).toMatch(/^http:\/\/localhost:5173\/verify-email#token=[\w-]{43}$/);
  });

  it('verifies exactly once', async () => {
    const { access } = await signUpAs('hopper@example.com');
    const token = await tokenFromMail('hopper@example.com', 'verify');

    await http.post('/api/auth/verify-email').send({ token }).expect(204);
    expect((await http.get('/api/users/me').set('Cookie', access)).body.emailVerified).toBe(true);

    const reuse = await http.post('/api/auth/verify-email').send({ token }).expect(400);
    expect(reuse.body.detail).toBe('This link is invalid or has expired. Request a new one.');
  });

  it('rejects an unknown token with the same message', async () => {
    const res = await http.post('/api/auth/verify-email').send({ token: 'made-up' }).expect(400);
    expect(res.body.detail).toBe('This link is invalid or has expired. Request a new one.');
  });

  it('resend needs a session, and sends nothing once verified', async () => {
    await http.post('/api/auth/verify-email/resend').expect(401);

    const { access } = await signUpAs('lamarr@example.com');
    await http.post('/api/auth/verify-email').send({ token: await tokenFromMail('lamarr@example.com', 'verify') });
    await http.post('/api/auth/verify-email/resend').set('Cookie', access).expect(202);
    await settle();
    expect(mailsTo('lamarr@example.com', 'verify')).toHaveLength(1);
  });

  it('resend (after the cooldown) issues a new link and kills the old one', async () => {
    const { access } = await signUpAs('turing@example.com');
    const first = await tokenFromMail('turing@example.com', 'verify');
    // Age the first link past the 60 s per-account cooldown (native driver: createdAt is immutable in Mongoose).
    const tokens = app.get<Model<unknown>>(getModelToken('OneTimeTokenRecord'));
    await tokens.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 120_000) } });

    await http.post('/api/auth/verify-email/resend').set('Cookie', access).expect(202);
    await vi.waitFor(() => expect(mailsTo('turing@example.com', 'verify')).toHaveLength(2));
    const second = await tokenFromMail('turing@example.com', 'verify');

    await http.post('/api/auth/verify-email').send({ token: first }).expect(400);
    await http.post('/api/auth/verify-email').send({ token: second }).expect(204);
  });
});

describe('password reset', () => {
  // Pinned: forgot-password returns 202 for unknown emails and when throttled.
  it('forgot-password answers 202 for an unknown email and sends nothing', async () => {
    await http.post('/api/auth/forgot-password').send({ email: 'nobody@example.com' }).expect(202);
    await settle();
    expect(mailsTo('nobody@example.com', 'reset')).toHaveLength(0);
  });

  it('a second request within the cooldown still answers 202 but sends nothing', async () => {
    await signUpAs('knuth@example.com');
    await http.post('/api/auth/forgot-password').send({ email: 'knuth@example.com' }).expect(202);
    await tokenFromMail('knuth@example.com', 'reset');

    await http.post('/api/auth/forgot-password').send({ email: 'KNUTH@example.com' }).expect(202);
    await settle();
    expect(mailsTo('knuth@example.com', 'reset')).toHaveLength(1);
  });

  // Pinned: after a reset, old sessions and the old password fail.
  it('resets the password, signs out every device, and the link works once', async () => {
    const laptop = await signUpAs('liskov@example.com', 'Old-pass1!');
    const phone = await http.post('/api/auth/signin').send({ email: 'liskov@example.com', password: 'Old-pass1!' }).expect(200);
    await http.post('/api/auth/forgot-password').send({ email: 'liskov@example.com' }).expect(202);
    const token = await tokenFromMail('liskov@example.com', 'reset');

    await http.post('/api/auth/reset-password').send({ token, password: 'New-pass1!', confirm: 'New-pass1!' }).expect(204);

    await http.get('/api/users/me').set('Cookie', laptop.access).expect(401); // old access token
    await http.post('/api/auth/refresh').set('Cookie', laptop.refresh).expect(401); // old refresh, device 1
    await http.post('/api/auth/refresh').set('Cookie', cookie(phone, REFRESH_COOKIE)).expect(401); // device 2
    await http.post('/api/auth/signin').send({ email: 'liskov@example.com', password: 'Old-pass1!' }).expect(401);
    const fresh = await http.post('/api/auth/signin').send({ email: 'liskov@example.com', password: 'New-pass1!' }).expect(200);
    expect(fresh.body.emailVerified).toBe(true); // owning the inbox proves the address

    await http.post('/api/auth/reset-password').send({ token, password: 'Other-pass1!', confirm: 'Other-pass1!' }).expect(400);
    await vi.waitFor(() => expect(mailsTo('liskov@example.com', 'changed')).toHaveLength(1));
  });

  it('a mismatched confirmation fails on the confirm field and leaves the link usable', async () => {
    await signUpAs('hamilton@example.com');
    await http.post('/api/auth/forgot-password').send({ email: 'hamilton@example.com' }).expect(202);
    const token = await tokenFromMail('hamilton@example.com', 'reset');

    const res = await http.post('/api/auth/reset-password').send({ token, password: 'New-pass1!', confirm: 'New-pass2!' }).expect(400);
    expect(res.body.errors).toEqual([{ path: 'confirm', message: 'Passwords don’t match' }]);
    await http.post('/api/auth/reset-password').send({ token, password: 'New-pass1!', confirm: 'New-pass1!' }).expect(204);
  });

  it('rejects a weak new password with field errors', async () => {
    const res = await http.post('/api/auth/reset-password').send({ token: 'x', password: 'weak', confirm: 'weak' }).expect(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain('password');
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
