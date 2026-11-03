import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { UserRecord, type UserDocument } from './user.schema.js';

@Injectable()
export class UsersService {
  constructor(@InjectModel(UserRecord.name) private readonly users: Model<UserRecord>) {}

  create(data: Pick<UserRecord, 'email' | 'name' | 'passwordHash'>): Promise<UserDocument> {
    return this.users.create(data);
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.users.findById(id).exec();
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email }).exec();
  }

  /** The only read that loads the password hash. */
  findByEmailWithHash(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email }).select('+passwordHash').exec();
  }

  async markEmailVerified(id: string, session?: ClientSession): Promise<void> {
    await this.users.updateOne({ _id: id, emailVerifiedAt: null }, { emailVerifiedAt: new Date() }, { session });
  }

  /**
   * New password: every token issued under the old sessionVersion stops working,
   * and a lockout is lifted (owning the inbox proves it's the real user).
   */
  async setPassword(id: string, passwordHash: string, session?: ClientSession): Promise<void> {
    await this.users.updateOne(
      { _id: id },
      { passwordHash, failedLogins: 0, lockedUntil: null, codeFailures: 0, codeFailuresSince: null, $inc: { sessionVersion: 1 } },
      { session },
    );
  }

  /**
   * Spends one sign-in attempt before the password is checked. One atomic
   * update, so a burst of parallel guesses can't all slip in before the count
   * moves. Returns the attempt number, or null if the account is locked or out
   * of attempts. A correct password then calls `clearFailedLogins`.
   */
  async reserveLoginAttempt(id: string, maxFailures: number): Promise<number | null> {
    const now = new Date();
    const user = await this.users
      .findOneAndUpdate(
        { _id: id, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }], failedLogins: { $lt: maxFailures } },
        { $inc: { failedLogins: 1 }, lockedUntil: null },
        { new: true },
      )
      .exec();
    return user ? user.failedLogins : null;
  }

  /** After the last allowed wrong password: lock, and start the count over for when it expires. */
  async lock(id: string, lockSeconds: number): Promise<void> {
    await this.users.updateOne({ _id: id }, { failedLogins: 0, lockedUntil: new Date(Date.now() + lockSeconds * 1000) });
  }

  async clearFailedLogins(id: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { failedLogins: 0, lockedUntil: null });
  }

  /**
   * Spends one one-time-code check from the account's budget (`max` per
   * `windowSeconds`, across every code issued). Returns false when the budget is
   * gone. Spent before the code is compared, in one atomic update, so parallel
   * guesses can't overshoot; a correct code clears it (`clearCodeFailures`).
   */
  async reserveCodeAttempt(id: string, max: number, windowSeconds: number): Promise<boolean> {
    const windowStart = new Date(Date.now() - windowSeconds * 1000);
    const newWindow = { $lt: [{ $ifNull: ['$codeFailuresSince', new Date(0)] }, windowStart] };
    const result = await this.users.updateOne(
      {
        _id: id,
        $or: [{ codeFailuresSince: null }, { codeFailuresSince: { $lt: windowStart } }, { codeFailures: { $lt: max } }],
      },
      [
        {
          $set: {
            codeFailures: { $cond: [newWindow, 1, { $add: ['$codeFailures', 1] }] },
            codeFailuresSince: { $cond: [newWindow, new Date(), '$codeFailuresSince'] },
          },
        },
      ],
      { updatePipeline: true },
    );
    return result.modifiedCount === 1;
  }

  async clearCodeFailures(id: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { codeFailures: 0, codeFailuresSince: null });
  }

  /**
   * Atomically claims the right to email this user (`kind` = verify or reset):
   * true at most once per `seconds`, even under concurrent requests, because the
   * check and the write are one findOneAndUpdate.
   */
  async claimMailSlot(id: string, kind: 'verify' | 'reset', seconds: number): Promise<boolean> {
    const field = `mailSentAt.${kind}`;
    const claimed = await this.users
      .findOneAndUpdate(
        { _id: id, $or: [{ [field]: null }, { [field]: { $lt: new Date(Date.now() - seconds * 1000) } }] },
        { [field]: new Date() },
      )
      .exec();
    return claimed !== null;
  }
}
