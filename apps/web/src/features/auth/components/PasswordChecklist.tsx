import { Check } from 'lucide-react';
import { passwordRules } from '@auth-module/shared/password-rules';
import { cn } from '@/lib/utils';

/** Live view of the same rules the API enforces. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul aria-live="polite" aria-label="Password requirements" className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {passwordRules.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={cn('flex items-center gap-1.5', ok ? 'text-foreground' : 'text-muted-foreground')}>
            {ok ? (
              <Check className="size-3.5 shrink-0 text-success" aria-hidden />
            ) : (
              <span aria-hidden className="mx-[5px] size-1 shrink-0 rounded-full bg-current" />
            )}
            <span>
              {rule.label}
              <span className="sr-only">{ok ? ' (met)' : ' (not met)'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
