import { Navigate, useLocation } from 'react-router-dom';
import { getT } from '../../lib/i18n';

function PageLoader({ lang = 'ar' }) {
  const t = getT(lang);
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[var(--text-sec)] animate-pulse">
        {t.loading}
      </div>
    </div>
  );
}

export default function ProtectedRoute({
  user,
  loadingAuth = false,
  lang = 'ar',
  redirectTo = '/login',
  children,
}) {
  const location = useLocation();

  if (loadingAuth) {
    return <PageLoader lang={lang} />;
  }

  if (!user) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }

  return children;
}