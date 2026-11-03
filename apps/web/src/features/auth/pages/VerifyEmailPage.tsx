import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { verifyEmailSchema } from '@auth-module/shared/auth-schemas';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api';
import { applyServerErrors } from '@/lib/form-errors';
import { useAuth } from '../AuthProvider';
import { AuthLayout } from '../components/AuthLayout';
import { CodeField } from '../components/CodeField';
import { FormError, SubmitButton } from '../components/FormStatus';

// Behind <RequireAuth>: the code verifies the signed-in user's own address.
export default function VerifyEmailPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const form = useForm({ resolver: zodResolver(verifyEmailSchema), mode: 'onTouched', defaultValues: { code: '' } });
  const {
    register,
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await api.post('/auth/verify-email', data);
      await auth.reloadUser();
      toast.success('Email confirmed');
      navigate('/', { replace: true });
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  async function resend() {
    setResending(true);
    try {
      await api.post('/auth/verify-email/resend');
      toast.success('We sent you a new code');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Couldn’t send the code. Try again.');
    } finally {
      setResending(false);
    }
  }

  if (auth.status !== 'authenticated') return null; // RequireAuth renders us only when signed in
  if (auth.user.emailVerified) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Confirm your email"
      description={`Enter the code we sent to ${auth.user.email}. It expires in 10 minutes.`}
      footer={
        <Link to="/" className="text-foreground underline underline-offset-4">
          Do it later
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FieldGroup>
          <CodeField error={errors.code} {...register('code')} />
        </FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <SubmitButton pending={isSubmitting}>Confirm email</SubmitButton>
        <Button type="button" variant="link" onClick={resend} disabled={resending}>
          Didn’t get it? Send a new code
        </Button>
      </form>
    </AuthLayout>
  );
}
