import { Body, Controller, Cookies, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type SignInInput,
  type SignUpInput,
  signInSchema,
  signUpSchema,
} from '@auth-module/shared/auth-schemas';
import type { User } from '@auth-module/shared/types';
import { Public } from '../common/decorators.js';
import { ACCESS_COOKIE, accessCookieOptions, REFRESH_COOKIE, refreshCookieOptions } from './auth.cookies.js';
import { type AuthResult, AuthService } from './auth.service.js';

@ApiTags('auth')
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  @Public()
  @Post('signup')
  @ApiCreatedResponse({ description: 'Account created; session cookies set' })
  @ApiBadRequestResponse({ description: 'Invalid fields (problem details with errors[])' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  async signUp(
    @Body({ schema: signUpSchema }) body: SignUpInput,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<User> {
    return this.startSession(res, await this.auth.signUp(body, userAgent));
  }

  @Public()
  @Post('signin')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Signed in; session cookies set' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async signIn(
    @Body({ schema: signInSchema }) body: SignInInput,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<User> {
    return this.startSession(res, await this.auth.signIn(body, userAgent));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Both cookies rotated' })
  @ApiUnauthorizedResponse({ description: 'Missing, expired, revoked or reused refresh token' })
  async refresh(
    @Cookies(REFRESH_COOKIE) refreshToken: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<User> {
    try {
      return this.startSession(res, await this.auth.refresh(refreshToken, userAgent));
    } catch (error) {
      this.clearSession(res); // a dead refresh token is useless; drop it
      throw error;
    }
  }

  // Public so a user with an expired access token can still log out.
  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse({ description: "This device's session revoked; cookies cleared" })
  async logout(@Cookies(REFRESH_COOKIE) refreshToken: string | undefined, @Res({ passthrough: true }) res: unknown) {
    await this.auth.logout(refreshToken);
    this.clearSession(res);
  }

  private startSession(res: unknown, { user, accessToken, refreshToken }: AuthResult): User {
    const { httpAdapter } = this.adapterHost;
    httpAdapter.setCookie(res, ACCESS_COOKIE, accessToken, accessCookieOptions);
    httpAdapter.setCookie(res, REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return user;
  }

  private clearSession(res: unknown): void {
    const { httpAdapter } = this.adapterHost;
    httpAdapter.clearCookie(res, ACCESS_COOKIE, accessCookieOptions);
    httpAdapter.clearCookie(res, REFRESH_COOKIE, refreshCookieOptions);
  }
}
