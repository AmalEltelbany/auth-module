import type { ComponentProps } from 'react';
import { OTP_LENGTH } from '@auth-module/shared/auth-schemas';
import { TextField } from './TextField';

/** The 6-digit code input: numeric keypad on phones, and autofill from the mail app. */
export function CodeField(props: Omit<ComponentProps<typeof TextField>, 'id' | 'label'>) {
  return (
    <TextField
      id="code"
      label={`${OTP_LENGTH}-digit code`}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={OTP_LENGTH + 2}
      className="font-mono tracking-[0.3em]"
      {...props}
    />
  );
}
