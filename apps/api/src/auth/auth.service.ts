import { BadRequestException, Injectable, Logger, type OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import type { Connection } from 'mongoose';
import type { ResetPasswordInput, SignInInput, SignUpInput } from '@auth-module/shared/auth-schemas';
import type { User } from '@auth-module/shared/types';
import { MailService } from '../mail/mail.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { toUser, type UserDocument } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { BreachedPasswordsService } from './breached-passwords.service.js';
import { OneTimeCodesService } from './one-time-codes.service.js';

export type AccessTokenPayload = { sub: string; sv: number };
export type AuthResult = { user: User; accessToken: string; refreshToken: string };

// One message for wrong, used, expired and exhausted codes, and unknown emails:
// no hint about which.
const INVALID_CODE = 'This OTP is invalid or has expired. Request a new one.';
// Per account, so a victim's inbox can't be flooded from many IPs.
const MAIL_COOLDOWN_SECONDS = 60;
// Per account, on top of the per-IP throttle: rotating IPs doesn't help guessing.
const MAX_FAILED_LOGINS = 5;
const LOCK_SECONDS = 15 * 60;
// Wrong one-time codes per account per day, across every code issued: about a
// 0.001% chance of guessing a 6-digit code per day, still generous for typos.
const MAX_DAILY_CODE_FAILURES = 10;
const CODE_BUDGET_WINDOW_SECONDS = 24 * 60 * 60;

@Injectable()
export class AuthService implements OnModuleInit {
  // Verified against when the email is unknown, so a miss takes as long as a
  // wrong password and response time doesn't reveal which emails exist.
  private dummyHash = '';
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly codes: OneTimeCodesService,
    private readonly mail: MailService,
    private readonly breached: BreachedPasswordsService,
    private readonly jwt: JwtService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('timing-equalizer');
  }

  async signUp(input: SignUpInput, userAgent?: string): Promise<AuthResult> {
    await this.rejectBreachedPassword(input.password);
    const passwordHash = await argon2.hash(input.password); // argon2id by default
    const user = await this.users.create({ email: input.email, name: input.name, passwordHash });
    // Not awaited: a mail outage must not block sign-up. The user can resend.
    this.inBackground('verification email', async () => {
      if (await this.users.claimMailSlot(user.id, 'verify', MAIL_COOLDOWN_SECONDS)) await this.sendVerificationCode(user);
    });
    return this.startSession(user, userAgent);
  }

  /** The signed-in user confirms their address with the emailed code. */
  async verifyEmail(user: User, code: string): Promise<void> {
    if (user.emailVerified) return;
    if (!(await this.checkCode(user.id, 'verify', code))) throw new BadRequestException(INVALID_CODE);
    await this.users.markEmailVerified(user.id);
  }

  async resendVerification(user: User): Promise<void> {
    if (user.emailVerified) return;
    if (!(await this.users.claimMailSlot(user.id, 'verify', MAIL_COOLDOWN_SECONDS))) return;
    const doc = await this.users.findById(user.id);
    if (doc) await this.sendVerificationCode(doc);
  }

  /**
   * Returns before doing anything, and the controller always answers 202, so
   * neither the response nor its timing reveals whether the email exists.
   */
  forgotPassword(email: string): void {
    setImmediate(() =>
      this.inBackground('password reset email', async () => {
        const user = await this.users.findByEmail(email);
        if (!user || !(await this.users.claimMailSlot(user.id, 'reset', MAIL_COOLDOWN_SECONDS))) return;
        await this.mail.sendPasswordResetCode(user.email, await this.codes.issue(user.id, 'reset'));
      }),
    );
  }

  /** New password, every device signed out, every reset code dead: all or nothing. */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    // Before the code is checked, so a rejected password doesn't burn the code.
    await this.rejectBreachedPassword(input.password);
    const user = await this.users.findByEmail(input.email);
    // The code is checked OUTSIDE the transaction: a wrong guess must spend an
    // attempt even though the request fails (an abort would roll it back).
    // Unknown emails get the same error as wrong codes.
    if (!user || !(await this.checkCode(user.id, 'reset', input.code))) {
      throw new BadRequestException(INVALID_CODE);
    }

    const passwordHash = await argon2.hash(input.password);
    await this.connection.transaction(async (session) => {
      await this.users.setPassword(user.id, passwordHash, session); // sessionVersion++ kills every token
      await this.users.markEmailVerified(user.id, session); // they just proved they own the inbox
      await this.codes.deleteAll(user.id, 'reset', session);
      await this.sessions.revokeAllForUser(user.id, session);
    });

    this.inBackground('password changed email', () => this.mail.sendPasswordChanged(user.email));
  }

  /**
   * Two limits on guessing: 5 attempts per code, and a daily budget per
   * account across ALL codes. The second stops an attacker who requests a fresh
   * code every minute to get 5 more guesses each time.
   */
  private async checkCode(userId: string, type: 'verify' | 'reset', code: string): Promise<boolean> {
    if (!(await this.users.reserveCodeAttempt(userId, MAX_DAILY_CODE_FAILURES, CODE_BUDGET_WINDOW_SECONDS))) {
      return false;
    }
    const ok = await this.codes.consume(userId, type, code);
    if (ok) await this.users.clearCodeFailures(userId);
    return ok;
  }

  /** A field error on `password`, so the form shows it under the input. */
  private async rejectBreachedPassword(password: string): Promise<void> {
    if (await this.breached.isBreached(password)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [{ path: 'password', message: 'This password has appeared in a data breach. Choose a different one.' }],
      });
    }
  }

  private async sendVerificationCode(user: UserDocument): Promise<void> {
    // The code is the only variable content: the address isn't verified yet, so
    // whoever signed up with it controls every other field (e.g. the name).
    await this.mail.sendVerificationCode(user.email, await this.codes.issue(user.id, 'verify'));
  }

  private inBackground(what: string, task: () => Promise<void>): void {
    task().catch((error: unknown) => this.logger.error(`Failed to send ${what}`, error instanceof Error ? error.stack : error));
  }

  async signIn(input: SignInInput, userAgent?: string): Promise<AuthResult> {
    const user = await this.users.findByEmailWithHash(input.email);
    // Spend the attempt BEFORE checking the password, atomically: parallel
    // guesses can't all read "not locked" first. null = locked / out of attempts.
    const attempt = user ? await this.users.reserveLoginAttempt(user.id, MAX_FAILED_LOGINS) : null;
    // Always verify (even when locked or unknown) so every failure takes the same time.
    const valid = await argon2.verify(user?.passwordHash ?? this.dummyHash, input.password);

    if (!user || attempt === null || !valid) {
      if (user && attempt === MAX_FAILED_LOGINS && !valid) {
        await this.users.lock(user.id, LOCK_SECONDS);
        this.logger.warn(`Account ${user.id} locked for ${LOCK_SECONDS / 60} min after ${MAX_FAILED_LOGINS} failed sign-ins`);
      }
      // Same answer when locked: a distinct message would confirm the account exists.
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.users.clearFailedLogins(user.id); // the reserved attempt was a success
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
