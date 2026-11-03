import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { OTP_LENGTH } from '@auth-module/shared/auth-schemas';
import { config } from '../config.js';
import { OneTimeCodeRecord, type OneTimeCodeType } from './one-time-code.schema.js';

const TTL_SECONDS = 10 * 60; // ASVS 6.5.5: out-of-band codes live 10 minutes at most
export const MAX_CODE_ATTEMPTS = 5;

// HMAC, not a plain hash: a 6-digit code has only a million values, so plain
// sha256 hashes from a leaked database would be reversed instantly. The key
// lives in config, not the database. (Reuses the JWT secret; rotating it just
// voids codes that are at most 10 minutes old.)
const hmac = (code: string) => createHmac('sha256', config.JWT_ACCESS_SECRET).update(code).digest();

@Injectable()
export class OneTimeCodesService {
  constructor(@InjectModel(OneTimeCodeRecord.name) private readonly codes: Model<OneTimeCodeRecord>) {}

  /** Issues a fresh code; the previous code of the same type stops working. */
  async issue(userId: string, type: OneTimeCodeType): Promise<string> {
    const code = randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
    await this.codes.deleteMany({ userId, type });
    await this.codes.create({
      userId,
      type,
      codeHash: hmac(code).toString('hex'),
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
    });
    return code;
  }

  /**
   * Checks and uses up a code. Every check spends one of the code's attempts
   * first, in a single atomic update, so concurrent guesses can't exceed the
   * limit. Call it outside transactions: an aborted transaction would roll the
   * attempt counter back and allow unlimited guesses.
   */
  async consume(userId: string, type: OneTimeCodeType, code: string): Promise<boolean> {
    const now = new Date();
    const live = await this.codes
      .findOneAndUpdate(
        { userId, type, usedAt: null, expiresAt: { $gt: now }, attempts: { $lt: MAX_CODE_ATTEMPTS } },
        { $inc: { attempts: 1 } },
      )
      .exec();
    if (!live || !timingSafeEqual(hmac(code), Buffer.from(live.codeHash, 'hex'))) return false;

    // Two correct submissions racing: only one wins the usedAt claim.
    const used = await this.codes.findOneAndUpdate({ _id: live._id, usedAt: null }, { usedAt: now }).exec();
    return used !== null;
  }

  /** After a password change: no reset code may still work. */
  async deleteAll(userId: string, type: OneTimeCodeType, session?: ClientSession): Promise<void> {
    await this.codes.deleteMany({ userId, type }, { session });
  }
}
