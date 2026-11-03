import { LogoMark } from '@/components/brand/Logo';
import { Spinner } from '@/components/ui/spinner';

export function FullPageSpinner() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <LogoMark className="size-9" />
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}
