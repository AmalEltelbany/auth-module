import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { VerifyBanner } from '../components/VerifyBanner';

/** The task's application page: the welcome message, who's signed in, and sign out. */
export default function HomePage() {
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  if (auth.status !== 'authenticated') return null; // <RequireAuth> only renders us when signed in
  const { user } = auth;

  async function signOut() {
    setSigningOut(true);
    await auth.signOut();
  }

  return (
    <AuthLayout
      title="Welcome to the application."
      description={
        <>
          You’re signed in as <span className="font-medium text-foreground">{user.name}</span> ({user.email}).
        </>
      }
      aside={
        <Button variant="outline" onClick={signOut} disabled={signingOut}>
          {signingOut && <Spinner aria-hidden />}
          Sign out
        </Button>
      }
    >
      {!user.emailVerified && <VerifyBanner email={user.email} />}
    </AuthLayout>
  );
}
