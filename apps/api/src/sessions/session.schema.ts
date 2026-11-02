import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

// One row per refresh token. Rotation adds a row to the same family; a token
// is never reused, so presenting a used one means it was copied.
@Schema({ collection: 'sessions', timestamps: true })
export class SessionRecord {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  familyId!: string;

  // The user's sessionVersion when this token was issued. Refresh fails once
  // the user's version moves on (e.g. after a password reset).
  @Prop({ required: true })
  sessionVersion!: number;

  // sha256 of the cookie value; the raw token is never stored.
  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: Date, default: null })
  usedAt!: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop()
  userAgent?: string;

  // TTL index: Mongo deletes the row after this date (its sweeper runs about
  // once a minute, so queries still check expiresAt themselves).
  @Prop({ type: Date, required: true, expires: 0 })
  expiresAt!: Date;
}

export type SessionDocument = HydratedDocument<SessionRecord>;
export const SessionSchema = SchemaFactory.createForClass(SessionRecord);
