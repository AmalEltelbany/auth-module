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

  /** New password, and every token issued under the old sessionVersion stops working. */
  async setPassword(id: string, passwordHash: string, session?: ClientSession): Promise<void> {
    await this.users.updateOne({ _id: id }, { passwordHash, $inc: { sessionVersion: 1 } }, { session });
  }
}
