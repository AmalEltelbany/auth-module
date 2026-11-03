import 'reflect-metadata';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { type Model, Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type OneTimeCodeRecord, OneTimeCodeSchema } from './one-time-code.schema.js';
import type { OneTimeCodesService as Service } from './one-time-codes.service.js';

let replSet: MongoMemoryReplSet;
let codes: Model<OneTimeCodeRecord>;
let service: Service;
let MAX_ATTEMPTS: number;
const userId = new Types.ObjectId().toString();

/** A code guaranteed to differ from `code`. */
const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = replSet.getUri('otp-unit');
  process.env.JWT_ACCESS_SECRET = 'unit-secret-that-is-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(replSet.getUri('otp-unit'));
  codes = mongoose.model<OneTimeCodeRecord>('OneTimeCodeRecord', OneTimeCodeSchema);

  // Imported after the env is set: config.ts parses it on first import.
  const mod = await import('./one-time-codes.service.js');
  service = new mod.OneTimeCodesService(codes);
  MAX_ATTEMPTS = mod.MAX_CODE_ATTEMPTS;
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await codes.deleteMany({});
});

describe('OneTimeCodesService', () => {
  it('issues a zero-padded 6-digit code and stores only its HMAC', async () => {
    const code = await service.issue(userId, 'verify');
    expect(code).toMatch(/^\d{6}$/);

    const stored = await codes.findOne({ userId }).lean();
    expect(stored!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('accepts the right code once, then never again', async () => {
    const code = await service.issue(userId, 'verify');
    expect(await service.consume(userId, 'verify', code)).toBe(true);
    expect(await service.consume(userId, 'verify', code)).toBe(false);
  });

  it('keeps verify and reset codes apart', async () => {
    const code = await service.issue(userId, 'verify');
    expect(await service.consume(userId, 'reset', code)).toBe(false);
    expect(await service.consume(userId, 'verify', code)).toBe(true);
  });

  it('kills the previous code when a new one is issued', async () => {
    const first = await service.issue(userId, 'reset');
    const second = await service.issue(userId, 'reset');
    if (first !== second) expect(await service.consume(userId, 'reset', first)).toBe(false);
    expect(await service.consume(userId, 'reset', second)).toBe(true);
    expect(await codes.countDocuments({ userId, type: 'reset' })).toBe(1);
  });

  it('is dead after 5 wrong attempts, even if the next one is right', async () => {
    const code = await service.issue(userId, 'reset');
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect(await service.consume(userId, 'reset', wrong(code))).toBe(false);
    expect(await service.consume(userId, 'reset', code)).toBe(false);
  });

  it('refuses an expired code even before Mongo’s TTL sweeper removes it', async () => {
    const code = await service.issue(userId, 'verify');
    await codes.updateOne({ userId }, { expiresAt: new Date(Date.now() - 1000) });
    expect(await service.consume(userId, 'verify', code)).toBe(false);
  });

  it('lets only one of several parallel correct submissions win', async () => {
    const code = await service.issue(userId, 'verify');
    const results = await Promise.all(Array.from({ length: 5 }, () => service.consume(userId, 'verify', code)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('never counts more than 5 attempts under parallel wrong guesses', async () => {
    const code = await service.issue(userId, 'verify');
    await Promise.all(Array.from({ length: 12 }, () => service.consume(userId, 'verify', wrong(code))));
    const stored = await codes.findOne({ userId }).lean();
    expect(stored!.attempts).toBe(MAX_ATTEMPTS);
  });

  it('deleteAll leaves no code of that type working', async () => {
    const code = await service.issue(userId, 'reset');
    await service.deleteAll(userId, 'reset');
    expect(await service.consume(userId, 'reset', code)).toBe(false);
  });
});
