import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
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
import { ACCESS_COOKIE, accessCookieOptions } from './auth.cookies.js';
import { AuthService } from './auth.service.js';

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
  @ApiCreatedResponse({ description: 'Account created; session cookie set' })
  @ApiBadRequestResponse({ description: 'Invalid fields (problem details with errors[])' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  async signUp(@Body({ schema: signUpSchema }) body: SignUpInput, @Res({ passthrough: true }) res: unknown): Promise<User> {
    const { user, accessToken } = await this.auth.signUp(body);
    this.adapterHost.httpAdapter.setCookie(res, ACCESS_COOKIE, accessToken, accessCookieOptions);
    return user;
  }

  @Public()
  @Post('signin')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Signed in; session cookie set' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async signIn(@Body({ schema: signInSchema }) body: SignInInput, @Res({ passthrough: true }) res: unknown): Promise<User> {
    const { user, accessToken } = await this.auth.signIn(body);
    this.adapterHost.httpAdapter.setCookie(res, ACCESS_COOKIE, accessToken, accessCookieOptions);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiNoContentResponse({ description: 'Session cookie cleared' })
  logout(@Res({ passthrough: true }) res: unknown): void {
    this.adapterHost.httpAdapter.clearCookie(res, ACCESS_COOKIE, accessCookieOptions);
  }
}
