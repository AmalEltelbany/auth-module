import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Reads `#token=…` from an email link once, then removes it from the address
 * bar so it doesn't linger in history, screenshots or a shared URL. The token
 * lives in the fragment, which browsers never send to servers or in Referer.
 */
export function useLinkToken(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token'));

  useEffect(() => {
    if (location.hash) navigate({ pathname: location.pathname, hash: '' }, { replace: true });
  }, [location.hash, location.pathname, navigate]);

  return token;
}
