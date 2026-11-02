import { Injectable, type OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { SignInInput, SignUpInput } from '@auth-module/shared/auth-schemas';
import type { User } from '@auth-module/shared/types';
import { SessionsService } from '../sessions/sessions.service.js';
import { toUser, type UserDocument } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';

export type AccessTokenPayload = { sub: string; sv: number };
export type AuthResult = { user: User; accessToken: string; refreshToken: string };

@Injectable()
export class AuthService implements OnModuleInit {
  // Verified against when the email is unknown, so a miss takes as long as a
  // wrong password and response time doesn't reveal which emails exist.
  private dummyHash = '';

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('timing-equalizer');
  }

  async signUp(input: SignUpInput, userAgent?: string): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password); // argon2id by default
    const user = await this.users.create({ email: input.email, name: input.name, passwordHash });
    return this.startSession(user, userAgent);
  }

  async signIn(input: SignInInput, userAgent?: string): Promise<AuthResult> {
    const user = await this.users.findByEmailWithHash(input.email);
    const valid = await argon2.verify(user?.passwordHash ?? this.dummyHash, input.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    return this.startSession(user, userAgent);
  }

  /** Exchanges a refresh token for a new access token and the next refresh token. */
  async refresh(refreshToken: string | undefined, userAgent?: string): Promise<AuthResult> {
    const session = refreshToken ? await this.sessions.claim(refreshToken) : null;
    const user = session && (await this.users.findById(session.userId));

    // A token issued before the user's sessionVersion moved on (password reset,
    // sign out everywhere) is dead, and so is the rest of its family.
    if (session && (!user || user.sessionVersion !== session.sessionVersion)) {
      await this.sessions.revokeFamily(session.familyId);
    }
    if (!session || !user || user.sessionVersion !== session.sessionVersion) {
      throw new UnauthorizedException('Session expired');
    }

    return {
      user: toUser(user),
      accessToken: await this.accessToken(user),
      refreshToken: await this.sessions.create(user.id, user.sessionVersion, session.familyId, userAgent),
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.sessions.revoke(refreshToken);
  }

  private async startSession(user: UserDocument, userAgent?: string): Promise<AuthResult> {
    return {
      user: toUser(user),
      accessToken: await this.accessToken(user),
      refreshToken: await this.sessions.create(user.id, user.sessionVersion, undefined, userAgent),
    };
  }

  private accessToken(user: UserDocument): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, sv: user.sessionVersion };
    return this.jwt.signAsync(payload);
  }
}
