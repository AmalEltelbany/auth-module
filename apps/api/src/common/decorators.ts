import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { User } from '@auth-module/shared/types';

export const IS_PUBLIC = 'isPublic';

/** Opts a route out of the global auth guard. Routes are protected by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The user the auth guard attached to the request. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User => ctx.switchToHttp().getRequest().user,
);
