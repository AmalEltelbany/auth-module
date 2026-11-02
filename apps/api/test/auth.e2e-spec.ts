import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ACCESS_COOKIE = '__Host-access_token';
const REFRESH_COOKIE = '__Host-refresh_token';
const valid = { email: 'Ada@Example.com', name: 'Ada Lovelace', password: 'Passw0rd!' };

let app: INestApplication;
let replSet: MongoMemoryReplSet;
let http: ReturnType<typeof request>;

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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
