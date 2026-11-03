import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

type Props = {
  title: string;
  description: ReactNode;
  children?: ReactNode;
  /** Under the form, e.g. "New here? Create an account". */
  footer?: ReactNode;
  /** Top-right, before the theme toggle, e.g. the home page's Sign out button. */
  aside?: ReactNode;
  /** Above the title, left-aligned, e.g. "Back to sign in" or "Go back". */
  back?: ReactNode;
};

// ponytail: read once at load; a tab left open over New Year shows last year until reload
const year = new Date().getFullYear();

/** Text links in the auth pages' footers and hints. */
export const authLinkClass =
  'rounded-sm font-medium text-link underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * The one page frame: the logo top-left, a narrow centered column (title,
 * description, content, optional line) on a plain page with no card, and a
 * small footer. Used by the auth pages, home, 404 and the route error page so
 * every screen looks the same.
 */
export function AuthLayout({ title, description, children, footer, aside, back }: Props) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <Link to="/" aria-label="Application home" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {aside}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-12 sm:justify-center sm:pb-24">
        <div className="w-full max-w-sm">
          {back && <div className="mb-6 text-sm">{back}</div>}
          <h1 className="text-center text-2xl font-bold tracking-tight text-balance">{title}</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">{description}</p>
          {children && <div className="mt-8">{children}</div>}
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>

      <footer className="border-t px-4 py-6 text-sm text-muted-foreground sm:px-6">
        © {year} Application
      </footer>
    </div>
  );
}
