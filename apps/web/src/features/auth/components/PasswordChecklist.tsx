import { CheckIcon, XIcon } from 'lucide-react';
import { passwordRules } from '@auth-module/shared/password-rules';
import { cn } from '@/lib/utils';

/** Live view of the same rules the API enforces. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul aria-live="polite" aria-label="Password requirements" className="grid gap-1 text-sm">
      {passwordRules.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={cn('flex items-center gap-1.5', ok ? 'text-foreground' : 'text-muted-foreground')}>
            {ok ? <CheckIcon className="size-3.5" aria-hidden /> : <XIcon className="size-3.5" aria-hidden />}
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
