import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { forgotPasswordSchema } from '@auth-module/shared/auth-schemas';
import { FieldGroup } from '@/components/ui/field';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/form-errors';
import { AuthLayout, authLinkClass } from '../components/AuthLayout';
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
      title="Reset password"
      description="Enter the email associated with your account and we’ll send you an OTP."
      back={
        <Link to="/signin" className={authLinkClass}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <FieldGroup>
          <TextField id="email" label="Email" type="email" autoComplete="username" error={errors.email} {...register('email')} />
        </FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <SubmitButton pending={isSubmitting}>Continue</SubmitButton>
      </form>
    </AuthLayout>
  );
}
