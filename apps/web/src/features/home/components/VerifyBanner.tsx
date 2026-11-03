import { Link } from 'react-router';
import { authLinkClass } from '@/features/auth/components/AuthLayout';
import { cn } from '@/lib/utils';

export function VerifyBanner({ email, className }: { email: string; className?: string }) {
  return (
    <p role="status" className={cn('rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm', className)}>
      Please confirm your email address. We sent an OTP to <span className="font-medium">{email}</span>.{' '}
      <Link to="/verify-email" className={authLinkClass}>
        Enter OTP
      </Link>
    </p>
  );
}
