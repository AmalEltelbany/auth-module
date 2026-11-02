import type { CookieSerializeOptions } from '@nestjs/common';
import { REFRESH_TOKEN_TTL_SECONDS } from '../sessions/sessions.service.js';

// __Host- prefix: browsers only accept it with Secure, Path=/ and no Domain,
// so the cookie can't be set or overwritten by a subdomain.
export const ACCESS_COOKIE = '__Host-access_token';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// __Secure- rather than __Host-, because __Host- forces Path=/ and this one is
// scoped to the auth routes: the long-lived token is never sent to /api/users.
export const REFRESH_COOKIE = '__Secure-refresh_token';

const base: CookieSerializeOptions = {
  httpOnly: true,
  secure: true, // browsers treat localhost as secure, so this works in dev too
  sameSite: 'strict',
};

export const accessCookieOptions: CookieSerializeOptions = {
  ...base,
  path: '/',
  maxAge: ACCESS_TOKEN_TTL_SECONDS, // seconds, not Express' milliseconds
};

export const refreshCookieOptions: CookieSerializeOptions = {
  ...base,
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_TTL_SECONDS,
};
