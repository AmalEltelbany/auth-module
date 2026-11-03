import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@auth-module/shared/auth-schemas';
import { FieldGroup } from '@/components/ui/field';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/form-errors';
import { useAuth } from '../AuthProvider';
import { AuthLayout } from '../components/AuthLayout';
import { CodeField } from '../components/CodeField';
import { FormError, SubmitButton } from '../components/FormStatus';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { PasswordInput } from '../components/PasswordInput';
import { TextField } from '../components/TextField';

export default function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const sentTo = (useLocation().state as { email?: string } | null)?.email ?? '';
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: { email: sentTo, code: '', password: '', confirm: '' },
  });
  const {
    register,
    control,
    formState: { errors, isSubmitting },
  } = form;
  const password = useWatch({ control, name: 'password' });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await api.post('/auth/reset-password', data);
      // Every session was revoked server-side; drop this tab's too.
      if (auth.status === 'authenticated') await auth.signOut();
      toast.success('Password changed. Sign in with your new password.');
      navigate('/signin', { replace: true });
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <AuthLayout
      title="Choose a new password"
      description={
        sentTo
          ? `If an account exists for ${sentTo}, we've sent it a 6-digit code. It expires in 10 minutes.`
          : 'Enter your email, the 6-digit code we sent you, and a new password.'
      }
      footer={
        <Link to="/forgot-password" className="text-foreground underline underline-offset-4">
          Didn’t get a code? Send a new one
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FieldGroup>
          <TextField id="email" label="Email" type="email" autoComplete="email" error={errors.email} {...register('email')} />
          <CodeField error={errors.code} {...register('code')} />
          <TextField
            id="password"
            label="New password"
            as={PasswordInput}
            autoComplete="new-password"
            error={errors.password}
            hint={<PasswordChecklist password={password} />}
            {...register('password')}
          />
          <TextField
            id="confirm"
            label="Confirm new password"
            as={PasswordInput}
            autoComplete="new-password"
            error={errors.confirm}
            {...register('confirm')}
          />
        </FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <SubmitButton pending={isSubmitting}>Change password</SubmitButton>
        <p className="text-center text-sm text-muted-foreground">This signs you out on every device.</p>
      </form>
    </AuthLayout>
  );
}
