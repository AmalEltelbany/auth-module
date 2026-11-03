import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type OneTimeTokenType = 'verify' | 'reset';

// Email-verification and password-reset links. Only sha256 of the token is
// stored, so a database leak hands out no working links.
@Schema({ collection: 'one_time_tokens', timestamps: true })
export class OneTimeTokenRecord {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['verify', 'reset'] })
  type!: OneTimeTokenType;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: Date, default: null })
  usedAt!: Date | null;

  // TTL index; queries still check expiresAt (the sweeper runs about once a minute).
  @Prop({ type: Date, required: true, expires: 0 })
  expiresAt!: Date;

  createdAt!: Date;
}

export type OneTimeTokenDocument = HydratedDocument<OneTimeTokenRecord>;
export const OneTimeTokenSchema = SchemaFactory.createForClass(OneTimeTokenRecord);
