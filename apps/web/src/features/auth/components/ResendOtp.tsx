import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { authLinkClass } from './AuthLayout';

/** Matches the API's per-account mail cooldown. */
const COOLDOWN_SECONDS = 60;

/** "0:59": no padded minutes. */
const format = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

type Props = {
  /** Sends a new OTP; resolves true when one was sent, so the countdown restarts. */
  onResend: () => Promise<boolean>;
  /** Start counting down right away, e.g. when an OTP was just sent. */
  justSent?: boolean;
};

/** Under the OTP boxes: "Resend OTP in 0:59", then a "Resend OTP" link. */
export function ResendOtp({ onResend, justSent = false }: Props) {
  const [seconds, setSeconds] = useState(justSent ? COOLDOWN_SECONDS : 0);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  // No aria-live: announcing every tick would drown out everything else.
  if (seconds > 0) return <p className="text-sm text-muted-foreground">Resend OTP in {format(seconds)}</p>;

  return (
    <button
      type="button"
      disabled={sending}
      // Field stretches its children to full width; keep the link hugging its text, on the left.
      className={cn(authLinkClass, 'w-auto! self-start text-sm disabled:opacity-50')}
      onClick={async () => {
        setSending(true);
        if (await onResend()) setSeconds(COOLDOWN_SECONDS);
        setSending(false);
      }}
    >
      Resend OTP
    </button>
  );
}
