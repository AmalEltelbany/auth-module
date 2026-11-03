import type { ComponentProps, ReactNode } from 'react';
import type { FieldError as RhfFieldError } from 'react-hook-form';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = ComponentProps<typeof Input> & {
  id: string;
  label: string;
  error?: RhfFieldError;
  /** Rendered under the input, e.g. the password checklist. */
  hint?: ReactNode;
  /** Replaces the plain input, e.g. with a password input. */
  as?: (props: ComponentProps<typeof Input>) => ReactNode;
};

/**
 * Label above input (never a placeholder in place of a label), error under it,
 * wired for screen readers. 36px tall: compact, still above WCAG 2.5.8's 24px minimum.
 */
export function TextField({ id, label, error, hint, as: Control = Input, className, ...inputProps }: Props) {
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Control
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn('h-9 px-3', className)}
        {...inputProps}
      />
      <FieldError id={errorId} errors={[error]} />
      {hint}
    </Field>
  );
}
