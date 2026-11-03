import { Monitor, Moon, Sun } from 'lucide-react';
import { setTheme, useTheme, type Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const options = [
  { value: 'system', label: 'System theme', Icon: Monitor },
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
] satisfies { value: Theme; label: string; Icon: typeof Sun }[];

/** System / Light / Dark side by side; the current one is pressed. */
export function ThemeToggle() {
  const theme = useTheme();
  return (
    <div role="group" aria-label="Theme" className="flex items-center gap-0.5 rounded-full border p-0.5">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            'flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
            theme === value && 'bg-muted text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
