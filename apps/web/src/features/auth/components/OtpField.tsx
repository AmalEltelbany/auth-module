import { type ComponentProps, type ReactNode, useState } from 'react';
import type { FieldError as RhfFieldError } from 'react-hook-form';
import { OTP_LENGTH } from '@auth-module/shared/auth-schemas';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<'input'>, 'id'> & {
  /** A format error, or the server's "invalid or expired": both belong to the boxes. */
  error?: { message?: string } | RhfFieldError;
  /** Under the boxes, e.g. the resend countdown. */
  hint?: ReactNode;
};

/**
 * The OTP as one box per digit. Underneath it's a single real input stretched
 * over the boxes: screen readers hear one field, and paste, the numeric keypad
 * and autofill from the mail app (one-time-code) work as normal.
 */
export function OtpField({ error, hint, onChange, onFocus, onBlur, className, ...inputProps }: Props) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="code">OTP</FieldLabel>
      <div className={cn('relative', className)}>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-invalid={!!error}
          aria-describedby={error ? 'code-error' : undefined}
          className="absolute inset-0 size-full cursor-text opacity-0"
          {...inputProps}
          onChange={(e) => {
            // Digits only, so "123 456" pasted from a mail fills all six boxes.
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
            setValue(e.target.value);
            onChange?.(e);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        <div aria-hidden className="pointer-events-none flex gap-2">
          {Array.from({ length: OTP_LENGTH }, (_, i) => (
            <div
              key={i}
              className={cn(
                'flex h-11 flex-1 items-center justify-center rounded-lg border border-input text-lg font-semibold tabular-nums transition-colors dark:bg-input/30',
                error && 'border-destructive',
                focused && i === active && 'border-ring ring-3 ring-ring/50',
              )}
            >
              {value[i] ?? (focused && i === active && <span className="h-5 w-px animate-pulse bg-foreground" />)}
            </div>
          ))}
        </div>
      </div>
      <FieldError id="code-error" errors={[error]} />
      {hint}
    </Field>
  );
}
