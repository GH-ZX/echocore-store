import { Navigate, useLocation } from 'react-router-dom';
import { shouldRedirectBannedUser } from '../../lib/siteAccess';

export default function SiteGate({ children, user }) {
  const location = useLocation();

  if (shouldRedirectBannedUser(user, location.pathname)) {
    return <Navigate to="/banned" replace />;
  }

  return children;
}