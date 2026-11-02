import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { useAuth } from './AuthProvider';

/** Layout route: renders its children only for a signed-in user. */
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <FullPageSpinner />;
  if (auth.status === 'unauthenticated') return <Navigate to="/signin" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Layout route: sign-in and sign-up pages, which a signed-in user skips. */
export function GuestOnly() {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/';

  if (auth.status === 'loading') return <FullPageSpinner />;
  if (auth.status === 'authenticated') return <Navigate to={from} replace />;
  return <Outlet />;
}
