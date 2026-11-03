import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { forgotPasswordSchema } from '@auth-module/shared/auth-schemas';
import { FieldGroup } from '@/components/ui/field';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/form-errors';
import { AuthLayout } from '../components/AuthLayout';
import { FormError, SubmitButton } from '../components/FormStatus';
import { TextField } from '../components/TextField';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), mode: 'onTouched', defaultValues: { email: '' } });
  const {
    register,
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await api.post('/auth/forgot-password', data);
      // Same next step whether or not the account exists: the API can't tell us, by design.
      navigate('/reset-password', { state: { email: data.email } });
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <AuthLayout
      title="Forgot your password?"
      description="Enter your email and we'll send you a 6-digit code."
      footer={
        <Link to="/signin" className="text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FieldGroup>
          <TextField id="email" label="Email" type="email" autoComplete="email" error={errors.email} {...register('email')} />
        </FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <SubmitButton pending={isSubmitting}>Send code</SubmitButton>
      </form>
    </AuthLayout>
  );
}
