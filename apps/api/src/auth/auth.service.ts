import { Injectable, type OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { SignInInput, SignUpInput } from '@auth-module/shared/auth-schemas';
import type { User } from '@auth-module/shared/types';
import { toUser, type UserDocument } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';

export type AccessTokenPayload = { sub: string; sv: number };
export type AuthResult = { user: User; accessToken: string };

@Injectable()
export class AuthService implements OnModuleInit {
  // Verified against when the email is unknown, so a miss takes as long as a
  // wrong password and response time doesn't reveal which emails exist.
  private dummyHash = '';

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('timing-equalizer');
  }

  async signUp(input: SignUpInput): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password); // argon2id by default
    const user = await this.users.create({ email: input.email, name: input.name, passwordHash });
    return this.issue(user);
  }

  async signIn(input: SignInInput): Promise<AuthResult> {
    const user = await this.users.findByEmailWithHash(input.email);
    const valid = await argon2.verify(user?.passwordHash ?? this.dummyHash, input.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    return this.issue(user);
  }

  private async issue(user: UserDocument): Promise<AuthResult> {
    const payload: AccessTokenPayload = { sub: user.id, sv: user.sessionVersion };
    return { user: toUser(user), accessToken: await this.jwt.signAsync(payload) };
  }
}
