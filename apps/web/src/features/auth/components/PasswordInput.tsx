import { EyeClosedIcon, EyeIcon } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function PasswordInput({ className, ...props }: ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      {/* Merge, don't replace: callers style the input too (height, icon padding). */}
      <Input {...props} type={visible ? 'text' : 'password'} className={cn(className, 'pr-11')} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        // Like Revenew's field: just the icon, swapped instantly. No hover fill, no
        // transition, no press nudge. Centered with my-auto, not a transform, which the
        // Button's active:translate-y would override and animate (the icon jumped on click).
        className="absolute inset-y-0 right-1.5 my-auto text-foreground transition-none hover:bg-transparent active:not-aria-[haspopup]:translate-y-0 dark:hover:bg-transparent [&_svg:not([class*='size-'])]:size-5"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {/* The icon shows the current state: a closed eye while the password is hidden. */}
        {visible ? <EyeIcon /> : <EyeClosedIcon />}
      </Button>
    </div>
  );
}
