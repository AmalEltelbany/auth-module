import { MailIcon } from 'lucide-react';
import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';

export function VerifyBanner({ email }: { email: string }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
      <MailIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">
        Please confirm your email address. We sent a 6-digit code to <strong>{email}</strong>.
      </p>
      <Link to="/verify-email" className={buttonVariants({ variant: 'link', size: 'sm', className: 'h-auto p-0' })}>
        Enter code
      </Link>
    </div>
  );
}
