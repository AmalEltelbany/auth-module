import type { ComponentProps, ReactNode } from 'react';
import type { FieldError as RhfFieldError } from 'react-hook-form';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Props = ComponentProps<typeof Input> & {
  id: string;
  label: string;
  error?: RhfFieldError;
  /** Rendered under the input, e.g. the password checklist. */
  hint?: ReactNode;
  /** Replaces the plain input, e.g. with a password input. */
  as?: (props: ComponentProps<typeof Input>) => ReactNode;
};

/** Label + input + error, wired for screen readers (aria-invalid / aria-describedby). */
export function TextField({ id, label, error, hint, as: Control = Input, ...inputProps }: Props) {
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Control id={id} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} {...inputProps} />
      <FieldError id={errorId} errors={[error]} />
      {hint}
    </Field>
  );
}
