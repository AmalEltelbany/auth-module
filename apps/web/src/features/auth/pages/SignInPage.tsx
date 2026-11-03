import { Link } from 'react-router';
import { FieldGroup } from '@/components/ui/field';
import { AuthLayout } from '../components/AuthLayout';
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
          <Link to="/signup" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FieldGroup>
          <TextField id="email" label="Email" type="email" autoComplete="email" error={errors.email} {...register('email')} />
          <TextField
            id="password"
            label="Password"
            as={PasswordInput}
            autoComplete="current-password"
            error={errors.password}
            hint={
              <Link to="/forgot-password" className="justify-self-end text-sm text-muted-foreground underline-offset-4 hover:underline">
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
