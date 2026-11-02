import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-2xl font-medium">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>
        Go home
      </Link>
    </main>
  );
}

export function NotFoundPage() {
  return <Message title="Page not found" body="The page you’re looking for doesn’t exist." />;
}

/** Shown instead of a blank screen when a route throws. */
export function RouteError() {
  return <Message title="Something went wrong" body="An unexpected error occurred. Please try again." />;
}
