import { Link } from 'react-router';
import { FieldGroup } from '@/components/ui/field';
import { AuthLayout, authLinkClass } from '../components/AuthLayout';
import { FormError, SubmitButton } from '../components/FormStatus';
import { PasswordInput } from '../components/PasswordInput';
import { TextField } from '../components/TextField';
import { useSignIn } from '../hooks/useSignIn';

export default function SignInPage() {
  const { form, onSubmit } = useSignIn();
  const {
    register,
    formState: { errors, isSubmitting },
  } = form;

  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back. Enter your email and password."
      footer={
        <p>
          New here?{' '}
          <Link to="/signup" className={authLinkClass}>
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <FieldGroup>
          {/* autocomplete="username" on the email lets password managers pair it with the password. */}
          <TextField id="email" label="Email" type="email" autoComplete="username" error={errors.email} {...register('email')} />
          <TextField
            id="password"
            label="Password"
            as={PasswordInput}
            autoComplete="current-password"
            error={errors.password}
            hint={
              // Field stretches every child to full width; shrink the link so its focus ring hugs the text.
              <Link to="/forgot-password" className={`w-auto! self-end text-sm ${authLinkClass}`}>
                Forgot password?
              </Link>
            }
            {...register('password')}
          />
        </FieldGroup>
        <FormError message={errors.root?.server?.message} />
        <SubmitButton pending={isSubmitting}>Sign in</SubmitButton>
      </form>
    </AuthLayout>
  );
}
