import { BadRequestException, Controller, Get, Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { Public } from './common/decorators.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { config } from './config.js';
import { UsersModule } from './users/users.module.js';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    MongooseModule.forRoot(config.MONGO_URI),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // per IP; auth routes are stricter
    UsersModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    {
      provide: APP_PIPE,
      // Field-level errors in the shape the web app maps onto form inputs.
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: (issues) =>
          new BadRequestException({
            message: 'Validation failed',
            errors: issues.map((issue) => ({
              path: (issue.path ?? []).map((p) => (typeof p === 'object' ? p.key : p)).join('.'),
              message: issue.message,
            })),
          }),
      }),
    },
  ],
})
export class AppModule {}
