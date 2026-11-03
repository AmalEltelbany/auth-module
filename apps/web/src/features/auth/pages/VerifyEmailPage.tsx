import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { verifyEmailSchema } from '@auth-module/shared/auth-schemas';
import { FieldGroup } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api';
import { applyServerErrors, isOtpRejected } from '@/lib/form-errors';
import { useAuth } from '../AuthProvider';
import { AuthLayout, authLinkClass } from '../components/AuthLayout';
import { FormError, SubmitButton } from '../components/FormStatus';
import { OtpField } from '../components/OtpField';
import { ResendOtp } from '../components/ResendOtp';

// Behind <RequireAuth>: the OTP verifies the signed-in user's own address.
export default function VerifyEmailPage() {
  const auth = useAuth();
  const navigate = useNavigate();
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
      if (isOtpRejected(error)) form.setError('code', { message: error.message }, { shouldFocus: true });
      else applyServerErrors(error, form.setError);
    }
  });

  async function resend() {
    try {
      await api.post('/auth/verify-email/resend');
      toast.success('We sent you a new OTP');
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Couldn’t send the OTP. Try again.');
      return false;
    }
  }

  if (auth.status !== 'authenticated') return null; // RequireAuth renders us only when signed in
  if (auth.user.emailVerified) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Confirm your email"
      description={`Enter the OTP sent to ${auth.user.email}. It expires in 10 minutes.`}
      back={
        <Link to="/" className={authLinkClass}>
          Do it later
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <FieldGroup>
          <OtpField
            error={errors.code}
            hint={<ResendOtp onResend={resend} />}
            // The red state clears as soon as the user edits the OTP; format checks come back on blur.
            {...register('code', { onChange: () => form.clearErrors('code') })}
          />
        </FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <SubmitButton pending={isSubmitting}>Confirm</SubmitButton>
      </form>
    </AuthLayout>
  );
}
