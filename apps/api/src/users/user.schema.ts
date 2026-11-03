import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { User } from '@auth-module/shared/types';

@Schema({ collection: 'users', timestamps: true })
export class UserRecord {
  // The unique index is what prevents duplicate accounts; the API never checks first.
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ type: Date, default: null })
  emailVerifiedAt!: Date | null;

  // Carried in access tokens; bumping it invalidates every live token at once.
  @Prop({ default: 0 })
  sessionVersion!: number;

  // Consecutive wrong passwords. Stored on the user, not in memory, so the
  // lockout holds across API instances and against attackers rotating IPs.
  @Prop({ default: 0 })
  failedLogins!: number;

  @Prop({ type: Date, default: null })
  lockedUntil!: Date | null;

  // Last verification / reset email, for the per-account mail cooldown.
  // raw(): a plain nested object, not a subdocument (which would get its own _id).
  @Prop(raw({ verify: { type: Date }, reset: { type: Date } }))
  mailSentAt?: { verify?: Date; reset?: Date };
}

export type UserDocument = HydratedDocument<UserRecord>;
export const UserSchema = SchemaFactory.createForClass(UserRecord);

export function toUser(doc: UserDocument): User {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    emailVerified: doc.emailVerifiedAt !== null,
  };
}
