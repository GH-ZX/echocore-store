import { Navigate, useLocation } from 'react-router-dom';

/** Legacy route — G2Bulk uses one voucher lane; platform cards live under /gift-cards */
export default function GamingAccountsView() {
  const location = useLocation();
  const target = `/gift-cards?filter=platform${location.search ? `&${location.search.slice(1)}` : ''}`;
  return <Navigate to={target} replace />;
}