import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { OneTimeTokenRecord, type OneTimeTokenType } from './one-time-token.schema.js';

const TTL_SECONDS: Record<OneTimeTokenType, number> = {
  verify: 24 * 60 * 60, // NIST 800-63B: 24 h for codes sent by email
  reset: 30 * 60,
};

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

@Injectable()
export class OneTimeTokensService {
  constructor(@InjectModel(OneTimeTokenRecord.name) private readonly tokens: Model<OneTimeTokenRecord>) {}

  /** Issues a fresh link token; older unused ones of the same type stop working. */
  async issue(userId: string, type: OneTimeTokenType): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.tokens.deleteMany({ userId, type, usedAt: null });
    await this.tokens.create({
      userId,
      type,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + TTL_SECONDS[type] * 1000),
    });
    return raw;
  }

  /** True if a token of this type was issued within `seconds`, for per-account rate limiting. */
  async issuedWithin(userId: string, type: OneTimeTokenType, seconds: number): Promise<boolean> {
    return !!(await this.tokens.exists({ userId, type, createdAt: { $gt: new Date(Date.now() - seconds * 1000) } }));
  }

  /**
   * Uses a token exactly once. One atomic findOneAndUpdate, so two clicks can't
   * both succeed. Returns the user id, or null for unknown/used/expired tokens.
   */
  async consume(raw: string, type: OneTimeTokenType, session?: ClientSession): Promise<string | null> {
    const now = new Date();
    const token = await this.tokens
      .findOneAndUpdate(
        { tokenHash: hash(raw), type, usedAt: null, expiresAt: { $gt: now } },
        { usedAt: now },
        { session },
      )
      .exec();
    return token ? token.userId.toString() : null;
  }

  /** After any password change: no reset link may still work. */
  async deleteResetTokens(userId: string, session?: ClientSession): Promise<void> {
    await this.tokens.deleteMany({ userId, type: 'reset' }, { session });
  }
}
