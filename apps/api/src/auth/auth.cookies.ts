import type { CookieSerializeOptions } from '@nestjs/common';
import { REFRESH_TOKEN_TTL_SECONDS } from '../sessions/sessions.service.js';

// Both cookies use the __Host- prefix: browsers only accept it with Secure,
// Path=/ and no Domain, so a sibling subdomain can't plant or overwrite them
// ("cookie tossing" would otherwise sign a victim into an attacker's account).
export const ACCESS_COOKIE = '__Host-access_token';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// Path=/ means the refresh token also reaches our other routes, over TLS,
// httpOnly and same-site only. Only POST /auth/refresh and /auth/logout read it.
export const REFRESH_COOKIE = '__Host-refresh_token';

const base: CookieSerializeOptions = {
  httpOnly: true,
  secure: true, // browsers treat localhost as secure, so this works in dev too
  sameSite: 'strict',
  path: '/',
};

export const accessCookieOptions: CookieSerializeOptions = {
  ...base,
  maxAge: ACCESS_TOKEN_TTL_SECONDS, // seconds, not Express' milliseconds
};

export const refreshCookieOptions: CookieSerializeOptions = {
  ...base,
  maxAge: REFRESH_TOKEN_TTL_SECONDS,
};
