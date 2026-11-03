import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { config } from '../config.js';
import { MailModule } from '../mail/mail.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.cookies.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { OneTimeTokenRecord, OneTimeTokenSchema } from './one-time-token.schema.js';
import { OneTimeTokensService } from './one-time-tokens.service.js';

@Module({
  imports: [
    UsersModule,
    SessionsModule,
    MailModule,
    MongooseModule.forFeature([{ name: OneTimeTokenRecord.name, schema: OneTimeTokenSchema }]),
    JwtModule.register({
      secret: config.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OneTimeTokensService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
