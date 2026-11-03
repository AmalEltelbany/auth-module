import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@auth-module/shared/auth-schemas';
import { FieldGroup } from '@/components/ui/field';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/form-errors';
import { useAuth } from '../AuthProvider';
import { AuthLayout } from '../components/AuthLayout';
import { FormError, SubmitButton } from '../components/FormStatus';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { PasswordInput } from '../components/PasswordInput';
import { TextField } from '../components/TextField';
import { useLinkToken } from '../hooks/useLinkToken';

export default function ResetPasswordPage() {
  const token = useLinkToken();
  const auth = useAuth();
  const navigate = useNavigate();
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: { token: token ?? '', password: '', confirm: '' },
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

  const requestNewLink = (
    <Link to="/forgot-password" className="text-foreground underline underline-offset-4">
      Request a new link
    </Link>
  );

  if (!token) {
    return (
      <AuthLayout title="Reset your password" description="This link is incomplete. Open the link from the email again." footer={requestNewLink}>
        {null}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" description="This signs you out on every device." footer={requestNewLink}>
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FieldGroup>
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
        <FormError message={errors.root?.server?.message ?? errors.token?.message} />
        <SubmitButton pending={isSubmitting}>Change password</SubmitButton>
      </form>
    </AuthLayout>
  );
}
