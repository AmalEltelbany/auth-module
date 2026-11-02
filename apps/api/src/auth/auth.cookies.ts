import type { CookieSerializeOptions } from '@nestjs/common';

// __Host- prefix: browsers only accept it with Secure, Path=/ and no Domain,
// so the cookie can't be set or overwritten by a subdomain.
export const ACCESS_COOKIE = '__Host-access_token';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const accessCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: true, // browsers treat localhost as secure, so this works in dev too
  sameSite: 'strict',
  path: '/',
  maxAge: ACCESS_TOKEN_TTL_SECONDS, // seconds, not Express' milliseconds
};
