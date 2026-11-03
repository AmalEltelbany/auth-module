import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type OneTimeCodeType = 'verify' | 'reset';

// The 6-digit codes emailed for verification and password reset. One live code
// per user and type; only an HMAC of the code is stored.
@Schema({ collection: 'one_time_codes', timestamps: true })
export class OneTimeCodeRecord {
  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['verify', 'reset'] })
  type!: OneTimeCodeType;

  @Prop({ required: true })
  codeHash!: string;

  // Wrong guesses so far; the code is dead at the limit.
  @Prop({ default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: null })
  usedAt!: Date | null;

  // TTL index; queries still check expiresAt (the sweeper runs about once a minute).
  @Prop({ type: Date, required: true, expires: 0 })
  expiresAt!: Date;
}

export type OneTimeCodeDocument = HydratedDocument<OneTimeCodeRecord>;
export const OneTimeCodeSchema = SchemaFactory.createForClass(OneTimeCodeRecord);
OneTimeCodeSchema.index({ userId: 1, type: 1 });
