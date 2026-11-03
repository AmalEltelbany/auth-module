import { useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '../AuthProvider';
import { AuthLayout } from '../components/AuthLayout';
import { FormError } from '../components/FormStatus';
import { useLinkToken } from '../hooks/useLinkToken';

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'done' } | { kind: 'error'; message: string };

export default function VerifyEmailPage() {
  const token = useLinkToken();
  const auth = useAuth();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Only a click sends the token: link scanners (e.g. Safe Links) open URLs and
  // run their JavaScript, and would otherwise use the link up before the user does.
  async function confirm() {
    setStatus({ kind: 'submitting' });
    try {
      await api.post('/auth/verify-email', { token });
      setStatus({ kind: 'done' });
      if (auth.status === 'authenticated') await auth.reloadUser();
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof ApiError ? error.message : 'Something went wrong.' });
    }
  }

  const home = (
    <Link to="/" className="text-foreground underline underline-offset-4">
      Go to the app
    </Link>
  );

  if (!token) {
    return (
      <AuthLayout title="Confirm your email" description="This link is incomplete. Open the link from the email again." footer={home}>
        {null}
      </AuthLayout>
    );
  }

  if (status.kind === 'done') {
    return (
      <AuthLayout title="Email confirmed" description="Thanks, your email address is verified." footer={null}>
        <Link to="/" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
          Continue
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Confirm your email" description="One click to confirm this is your email address." footer={home}>
      <div className="grid gap-5">
        <FormError message={status.kind === 'error' ? status.message : undefined} />
        <Button size="lg" className="w-full" onClick={confirm} disabled={status.kind === 'submitting'}>
          {status.kind === 'submitting' && <Spinner aria-hidden />}
          Confirm my email
        </Button>
      </div>
    </AuthLayout>
  );
}
