import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { SessionRecord } from './session.schema.js';

export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(@InjectModel(SessionRecord.name) private readonly sessions: Model<SessionRecord>) {}

  /**
   * Starts a session (or continues a family) and returns the raw refresh token.
   * `sessionVersion` is the user's version at issue time: a token from before a
   * password reset can then never be exchanged afterwards.
   */
  async create(
    userId: string,
    sessionVersion: number,
    familyId: string = randomUUID(),
    userAgent?: string,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.sessions.create({
      userId,
      sessionVersion,
      familyId,
      tokenHash: hash(raw),
      userAgent,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    return raw;
  }

  /**
   * Marks a refresh token used and returns its session, or null when the token
   * is unknown, expired, revoked or already used. An already-used token is a
   * replay of a copied token, so its whole family is revoked.
   */
  async claim(raw: string): Promise<{ userId: string; sessionVersion: number; familyId: string } | null> {
    const tokenHash = hash(raw);
    const now = new Date();

    // One atomic claim: two concurrent requests can't both use the same token.
    const current = await this.sessions
      .findOneAndUpdate(
        { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
        { usedAt: now },
      )
      .exec();

    if (!current) {
      const replayed = await this.sessions.findOne({ tokenHash, usedAt: { $ne: null } }).exec();
      if (replayed) {
        this.logger.warn(`Refresh token reuse detected; revoking family for user ${replayed.userId.toString()}`);
        await this.revokeFamily(replayed.familyId);
      }
      return null;
    }

    return { userId: current.userId.toString(), sessionVersion: current.sessionVersion, familyId: current.familyId };
  }

  /** Logout: ends this device's session family. */
  async revoke(raw: string): Promise<void> {
    const session = await this.sessions.findOne({ tokenHash: hash(raw) }).exec();
    if (session) await this.revokeFamily(session.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.sessions.updateMany({ familyId, revokedAt: null }, { revokedAt: new Date() }).exec();
  }
}
