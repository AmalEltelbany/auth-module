import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BreachedPasswordsService } from './breached-passwords.service.js';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();
const service = new BreachedPasswordsService();

/** A fake HIBP range response containing `rows`. */
function stubHibp(rows: string[]) {
  const fetchMock = vi.fn(async (_url: string) => new Response(rows.join('\r\n')));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BreachedPasswordsService', () => {
  it('sends only the 5-character hash prefix, never the password or full hash', async () => {
    const fetchMock = stubHibp([]);
    await service.isBreached('Passw0rd!');

    const url = fetchMock.mock.calls[0]![0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1('Passw0rd!').slice(0, 5)}`);
    expect(url).not.toContain(sha1('Passw0rd!').slice(5));
  });

  it('reports a password whose suffix appears with a count', async () => {
    stubHibp(['0000000000000000000000000000000000A:0', `${sha1('Passw0rd!').slice(5)}:3861`]);
    expect(await service.isBreached('Passw0rd!')).toBe(true);
  });

  it('ignores padding rows (count 0) that happen to match', async () => {
    stubHibp([`${sha1('Unique-pass1!').slice(5)}:0`]);
    expect(await service.isBreached('Unique-pass1!')).toBe(false);
  });

  it('fails open when HIBP is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    expect(await service.isBreached('Passw0rd!')).toBe(false);
  });
});
