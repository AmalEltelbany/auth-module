import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { signInSchema } from '@auth-module/shared/auth-schemas';
import { applyServerErrors } from '@/lib/form-errors';
import { useAuth } from '../AuthProvider';

// No navigate() here: once signed in, <GuestOnly> sends the user back where they came from.
export function useSignIn() {
  const { signIn } = useAuth();
  const form = useForm({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await signIn(data);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return { form, onSubmit };
}
