import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** Errors that belong to no single field (wrong credentials, network failure). */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
      {message}
    </p>
  );
}

/** Disabled while pending, so a double click can't submit twice. */
export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" className="h-9 w-full text-sm font-semibold" disabled={pending}>
      {pending && <Spinner aria-hidden />}
      {children}
    </Button>
  );
}
