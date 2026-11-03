import { useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { FieldGroup } from '@/components/ui/field';
import { AuthLayout, authLinkClass } from '../components/AuthLayout';
import { FormError, SubmitButton } from '../components/FormStatus';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { PasswordInput } from '../components/PasswordInput';
import { TextField } from '../components/TextField';
import { useSignUp } from '../hooks/useSignUp';

export default function SignUpPage() {
  const { form, onSubmit } = useSignUp();
  const {
    register,
    control,
    formState: { errors, isSubmitting },
  } = form;
  const password = useWatch({ control, name: 'password' });

  return (
    <AuthLayout
      title="Create an account"
      description="It takes a minute. We’ll email you a code to confirm your address."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/signin" className={authLinkClass}>
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <FieldGroup>
          <TextField id="name" label="Name" autoComplete="name" error={errors.name} {...register('name')} />
          <TextField id="email" label="Email" type="email" autoComplete="username" error={errors.email} {...register('email')} />
          <TextField
            id="password"
            label="Password"
            as={PasswordInput}
            autoComplete="new-password"
            error={errors.password}
            hint={<PasswordChecklist password={password} />}
            {...register('password')}
          />
        </FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <SubmitButton pending={isSubmitting}>Create account</SubmitButton>
      </form>
    </AuthLayout>
  );
}
