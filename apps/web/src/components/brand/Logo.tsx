import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lucide's "layers" (ISC) on a near-black tile. Same artwork as public/favicon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground', className)}
    >
      <Layers className="size-5" strokeWidth={2.25} />
    </span>
  );
}

/** Mark + wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className="size-7 rounded-md [&_svg]:size-4" />
      <span className="text-base font-semibold tracking-tight">Application</span>
    </span>
  );
}
