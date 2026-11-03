import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { forgotPasswordSchema } from '@auth-module/shared/auth-schemas';
import { FieldGroup } from '@/components/ui/field';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/form-errors';
import { AuthLayout } from '../components/AuthLayout';
import { FormError, SubmitButton } from '../components/FormStatus';
import { TextField } from '../components/TextField';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), mode: 'onTouched', defaultValues: { email: '' } });
  const {
    register,
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await api.post('/auth/forgot-password', data);
      setSentTo(data.email);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  const backToSignIn = (
    <Link to="/signin" className="text-foreground underline underline-offset-4">
      Back to sign in
    </Link>
  );

  if (sentTo) {
    // The same message whether or not the account exists: the API can't tell us, by design.
    return (
      <AuthLayout
        title="Check your email"
        description={`If an account exists for ${sentTo}, we've sent a link to reset the password. It expires in 30 minutes.`}
        footer={backToSignIn}
      >
        {null}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot your password?" description="Enter your email and we'll send you a reset link." footer={backToSignIn}>
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FieldGroup>
          <TextField id="email" label="Email" type="email" autoComplete="email" error={errors.email} {...register('email')} />
        </FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <SubmitButton pending={isSubmitting}>Send reset link</SubmitButton>
      </form>
    </AuthLayout>
  );
}
