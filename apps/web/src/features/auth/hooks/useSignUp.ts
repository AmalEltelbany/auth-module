import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { signUpSchema } from '@auth-module/shared/auth-schemas';
import { applyServerErrors } from '@/lib/form-errors';
import { useAuth } from '../AuthProvider';

// No navigate() here: once signed in, the <GuestOnly> route redirects.
export function useSignUp() {
  const { signUp } = useAuth();
  const form = useForm({
    resolver: zodResolver(signUpSchema),
    mode: 'onTouched',
    defaultValues: { email: '', name: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await signUp(data);
      toast.success('Account created');
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return { form, onSubmit };
}
