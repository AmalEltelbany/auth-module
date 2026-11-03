import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Have I Been Pwned "range" lookup (k-anonymity): only the first 5 hex chars of
 * the password's SHA-1 leave the server, and the reply lists every breached
 * suffix with that prefix. NIST 800-63B requires checking new passwords against
 * breached ones.
 */
@Injectable()
export class BreachedPasswordsService {
  private readonly logger = new Logger(BreachedPasswordsService.name);

  async isBreached(password: string): Promise<boolean> {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        // Padding hides the real size of the reply from anyone watching the traffic.
        headers: { 'Add-Padding': 'true', 'User-Agent': 'auth-module' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.text()).split('\n').some((line) => {
        const [hashSuffix, count] = line.trim().split(':');
        return hashSuffix === suffix && Number(count) > 0; // padding rows have count 0
      });
    } catch (error) {
      // Fail open: an HIBP outage must not block sign-up or password reset.
      this.logger.warn(`Breached-password check unavailable, allowing: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }
}
