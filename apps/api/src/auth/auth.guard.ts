import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
// ponytail: Nest 12's cookie reader isn't re-exported from the package root yet;
// switch to the public export when it lands.
import { getRequestCookie } from '@nestjs/core/helpers/cookies/request-cookies.js';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from '../common/decorators.js';
import { toUser } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { ACCESS_COOKIE } from './auth.cookies.js';
import type { AccessTokenPayload } from './auth.service.js';

// Registered globally: every route requires a valid session unless marked @Public().
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = getRequestCookie(req, ACCESS_COOKIE);
    if (!token) throw new UnauthorizedException();

    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token).catch(() => null);
    const user = payload && (await this.users.findById(payload.sub));
    // A changed sessionVersion (e.g. after a password reset) revokes older tokens.
    if (!user || user.sessionVersion !== payload.sv) throw new UnauthorizedException();

    req.user = toUser(user);
    return true;
  }
}
