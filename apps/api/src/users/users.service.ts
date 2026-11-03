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
      { passwordHash, failedLogins: 0, lockedUntil: null, $inc: { sessionVersion: 1 } },
      { session },
    );
  }

  /** Counts a wrong password; the `maxFailures`-th one locks the account for `lockSeconds`. */
  async recordFailedLogin(id: string, maxFailures: number, lockSeconds: number): Promise<boolean> {
    const user = await this.users.findByIdAndUpdate(id, { $inc: { failedLogins: 1 } }, { new: true }).exec();
    if (!user || user.failedLogins < maxFailures) return false;
    await this.users.updateOne({ _id: id }, { failedLogins: 0, lockedUntil: new Date(Date.now() + lockSeconds * 1000) });
    return true;
  }

  async clearFailedLogins(id: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { failedLogins: 0, lockedUntil: null });
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
