import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { User } from '@auth-module/shared/types';
import { CurrentUser } from '../common/decorators.js';

@ApiTags('users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  @Get('me')
  @ApiOkResponse({ description: 'The signed-in user' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session' })
  me(@CurrentUser() user: User): User {
    return user;
  }
}
