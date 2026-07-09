import { Navigate, useLocation } from 'react-router-dom';

function PageLoader({ lang = 'ar' }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[var(--text-sec)] animate-pulse">
        {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
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