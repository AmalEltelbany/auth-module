import { BadRequestException, Injectable, Logger, type OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import type { Connection } from 'mongoose';
import type { ResetPasswordInput, SignInInput, SignUpInput } from '@auth-module/shared/auth-schemas';
import type { User } from '@auth-module/shared/types';
import { config } from '../config.js';
import { MailService } from '../mail/mail.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { toUser, type UserDocument } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { OneTimeTokensService } from './one-time-tokens.service.js';

export type AccessTokenPayload = { sub: string; sv: number };
export type AuthResult = { user: User; accessToken: string; refreshToken: string };

// One message for unknown, used and expired links: no hint about which.
const INVALID_LINK = 'This link is invalid or has expired. Request a new one.';
// Per account, so a victim's inbox can't be flooded from many IPs.
const MAIL_COOLDOWN_SECONDS = 60;

@Injectable()
export class AuthService implements OnModuleInit {
  // Verified against when the email is unknown, so a miss takes as long as a
  // wrong password and response time doesn't reveal which emails exist.
  private dummyHash = '';
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly tokens: OneTimeTokensService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('timing-equalizer');
  }

  async signUp(input: SignUpInput, userAgent?: string): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password); // argon2id by default
    const user = await this.users.create({ email: input.email, name: input.name, passwordHash });
    // Not awaited: a mail outage must not block sign-up. The user can resend.
    this.inBackground('verification email', () => this.sendVerificationLink(user));
    return this.startSession(user, userAgent);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.tokens.consume(token, 'verify');
    if (!userId) throw new BadRequestException(INVALID_LINK);
    await this.users.markEmailVerified(userId);
  }

  async resendVerification(user: User): Promise<void> {
    if (user.emailVerified) return;
    if (await this.tokens.issuedWithin(user.id, 'verify', MAIL_COOLDOWN_SECONDS)) return;
    const doc = await this.users.findById(user.id);
    if (doc) await this.sendVerificationLink(doc);
  }

  /**
   * Returns before doing anything, and the controller always answers 202, so
   * neither the response nor its timing reveals whether the email exists.
   */
  forgotPassword(email: string): void {
    setImmediate(() =>
      this.inBackground('password reset email', async () => {
        const user = await this.users.findByEmail(email);
        if (!user || (await this.tokens.issuedWithin(user.id, 'reset', MAIL_COOLDOWN_SECONDS))) return;
        const raw = await this.tokens.issue(user.id, 'reset');
        await this.mail.sendPasswordReset(user.email, `${config.APP_URL}/reset-password#token=${raw}`);
      }),
    );
  }

  /** New password, every device signed out, every reset link dead: all or nothing. */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const passwordHash = await argon2.hash(input.password); // outside the transaction: retries reuse it

    const userId = await this.connection.transaction(async (session) => {
      const id = await this.tokens.consume(input.token, 'reset', session);
      if (!id) throw new BadRequestException(INVALID_LINK);
      await this.users.setPassword(id, passwordHash, session); // sessionVersion++ kills access tokens
      await this.users.markEmailVerified(id, session); // they just proved they own the inbox
      await this.tokens.deleteResetTokens(id, session);
      await this.sessions.revokeAllForUser(id, session);
      return id;
    });

    const user = await this.users.findById(userId);
    if (user) this.inBackground('password changed email', () => this.mail.sendPasswordChanged(user.email));
  }

  private async sendVerificationLink(user: UserDocument): Promise<void> {
    const raw = await this.tokens.issue(user.id, 'verify');
    await this.mail.sendVerification(user.email, user.name, `${config.APP_URL}/verify-email#token=${raw}`);
  }

  private inBackground(what: string, task: () => Promise<void>): void {
    task().catch((error: unknown) => this.logger.error(`Failed to send ${what}`, error instanceof Error ? error.stack : error));
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
