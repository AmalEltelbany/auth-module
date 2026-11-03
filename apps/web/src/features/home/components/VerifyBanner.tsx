import { MailIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';

export function VerifyBanner({ email }: { email: string }) {
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    try {
      await api.post('/auth/verify-email/resend');
      toast.success(`Verification email sent to ${email}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Couldn’t send the email. Try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div role="status" className="flex items-start gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
      <MailIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">
        Please confirm your email address. We sent a link to <strong>{email}</strong>.
      </p>
      <Button variant="link" size="sm" className="h-auto p-0" onClick={resend} disabled={sending}>
        Resend
      </Button>
    </div>
  );
}
