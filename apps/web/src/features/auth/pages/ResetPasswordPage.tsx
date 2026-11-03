import { zodResolver } from '@hookform/resolvers/zod';
import { type FormEvent, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@auth-module/shared/auth-schemas';
import { FieldGroup } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api';
import { applyServerErrors, isOtpRejected } from '@/lib/form-errors';
import { useAuth } from '../AuthProvider';
import { AuthLayout, authLinkClass } from '../components/AuthLayout';
import { FormError, SubmitButton } from '../components/FormStatus';
import { OtpField } from '../components/OtpField';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { PasswordInput } from '../components/PasswordInput';
import { ResendOtp } from '../components/ResendOtp';
import { TextField } from '../components/TextField';

type Step = 'otp' | 'password';

/**
 * Two steps, one request: the OTP first, then the new password.
 * ponytail: step 1 only checks the OTP's format. There's no "check the OTP"
 * endpoint (it would spend an attempt and need a token to carry to step 2), so
 * a wrong OTP shows up when the password is submitted and sends you back here.
 */
export default function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const sentTo = (useLocation().state as { email?: string } | null)?.email ?? '';
  const [step, setStep] = useState<Step>('otp');
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: { email: sentTo, code: '', password: '' },
  });
  const {
    register,
    control,
    formState: { errors, isSubmitting },
  } = form;
  const password = useWatch({ control, name: 'password' });

  // Render the new step before moving focus into it.
  function goTo(next: Step) {
    flushSync(() => setStep(next));
    form.setFocus(next === 'otp' ? 'code' : 'password');
  }

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await api.post('/auth/reset-password', data);
      // Every session was revoked server-side; drop this tab's too.
      if (auth.status === 'authenticated') await auth.signOut();
      toast.success('Password reset. Sign in with your new password.');
      navigate('/signin', { replace: true });
    } catch (error) {
      if (isOtpRejected(error)) {
        goTo('otp');
        form.setError('code', { message: error.message }, { shouldFocus: true });
        return;
      }
      applyServerErrors(error, form.setError);
      // A field error for anything but the password has no visible field on this
      // step (e.g. an outdated API asking for another field): say so above the button.
      if (error instanceof ApiError && error.fieldErrors.some((e) => e.path !== 'password')) {
        form.setError('root.server', { message: 'Something went wrong. Please try again.' });
      }
    }
  });

  async function confirmOtp(e: FormEvent) {
    e.preventDefault();
    if (await form.trigger(['email', 'code'], { shouldFocus: true })) goTo('password');
  }

  async function resend() {
    if (!(await form.trigger('email', { shouldFocus: true }))) return false;
    try {
      await api.post('/auth/forgot-password', { email: form.getValues('email') });
      toast.success('We sent you a new OTP');
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Couldn’t send the OTP. Try again.');
      return false;
    }
  }

  return (
    <AuthLayout
      title="Reset password"
      description={
        step === 'password'
          ? 'Pick a new password. Changing it signs you out everywhere.'
          : sentTo
            ? `Enter the OTP sent to ${sentTo}. It expires in 10 minutes.`
            : 'Enter your email and the OTP we sent you.'
      }
      back={
        step === 'otp' ? (
          <Link to="/forgot-password" className={authLinkClass}>
            Go back
          </Link>
        ) : (
          <button type="button" className={authLinkClass} onClick={() => goTo('otp')} disabled={isSubmitting}>
            Go back
          </button>
        )
      }
    >
      <form onSubmit={step === 'otp' ? confirmOtp : onSubmit} noValidate className="grid gap-6">
        <FieldGroup hidden={step !== 'otp'}>
          {/* Arrived from "Reset password": the email is already known and shown above. */}
          {!sentTo && (
            <TextField id="email" label="Email" type="email" autoComplete="username" error={errors.email} {...register('email')} />
          )}
          <OtpField
            error={errors.code}
            hint={<ResendOtp onResend={resend} justSent={!!sentTo} />}
            // The red state clears as soon as the user edits the OTP; format checks come back on blur.
            {...register('code', { onChange: () => form.clearErrors('code') })}
          />
        </FieldGroup>
        {step === 'password' && (
          <FieldGroup>
            {/* One field, no "confirm": the show-password toggle catches typos. */}
            <TextField
              id="password"
              label="New password"
              as={PasswordInput}
              autoComplete="new-password"
              error={errors.password}
              hint={<PasswordChecklist password={password} />}
              {...register('password')}
            />
          </FieldGroup>
        )}
        {step === 'password' && <FormError message={errors.root?.server?.message} />}
        {step === 'otp' ? (
          <SubmitButton pending={false}>Confirm</SubmitButton>
        ) : (
          <SubmitButton pending={isSubmitting}>Reset password</SubmitButton>
        )}
      </form>
    </AuthLayout>
  );
}
