import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { AuthLayout } from '@/features/auth/components/AuthLayout';

function Message({ title, body }: { title: string; body: string }) {
  return (
    <AuthLayout title={title} description={body}>
      <Link to="/" className={buttonVariants({ className: 'h-9 w-full font-semibold' })}>
        Go home
      </Link>
    </AuthLayout>
  );
}

export function NotFoundPage() {
  return <Message title="Page not found" body="The page you’re looking for doesn’t exist or has moved." />;
}

/** Shown instead of a blank screen when a route throws. */
export function RouteError() {
  return <Message title="Something went wrong" body="An unexpected error occurred. Please try again." />;
}
