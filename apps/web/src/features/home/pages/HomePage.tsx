import { LogOutIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { VerifyBanner } from '../components/VerifyBanner';

export default function HomePage() {
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const user = auth.status === 'authenticated' ? auth.user : null;

  async function signOut() {
    setSigningOut(true);
    await auth.signOut();
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl">Welcome to the application.</h1>
          </CardTitle>
          {user && (
            <CardDescription>
              Signed in as {user.name} ({user.email})
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid justify-items-start gap-4">
          {user && !user.emailVerified && <VerifyBanner email={user.email} />}
          <Button variant="outline" onClick={signOut} disabled={signingOut}>
            {signingOut ? <Spinner aria-hidden /> : <LogOutIcon aria-hidden />}
            Log out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
