import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
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

  /** The only read that loads the password hash. */
  findByEmailWithHash(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email }).select('+passwordHash').exec();
  }
}
