import { NavLink, useLocation } from 'react-router-dom';
import { Home, Gamepad2, Search, ShoppingCart, User } from 'lucide-react';

/** Paths where the storefront bottom nav must stay out of the way. */
const HIDDEN_PREFIXES = ['/dashboard', '/banned', '/checkout', '/buy/'];

function isHiddenPath(pathname = '') {
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  // Offer purchase flow has its own sticky buy bar
  return pathname.endsWith('/buy');
}

export default function MobileBottomNav({ t = {}, user = null, cartCount = 0 }) {
  const { pathname } = useLocation();
  if (isHiddenPath(pathname)) return null;

  const items = [
    { id: 'home', to: '/', label: t.home, icon: Home, exact: true },
    { id: 'games', to: '/games', label: t.bottomNavGames, icon: Gamepad2 },
    { id: 'search', to: '/search', label: t.searchAction, icon: Search },
    { id: 'cart', to: '/cart', label: t.cart, icon: ShoppingCart, badge: cartCount },
    {
      id: 'profile',
      to: user ? '/profile' : '/login',
      label: user ? t.myProfile : t.login,
      icon: User,
    },
  ];

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label={t.mainNavLabel || t.home}>
      {items.map(({ id, to, label, icon: Icon, badge, exact }) => (
        <NavLink
          key={id}
          to={to}
          end={exact}
          className={({ isActive }) => `mobile-bottom-nav__item${
            isActive ? ' mobile-bottom-nav__item--active' : ''
          }`}
        >
          <span className="mobile-bottom-nav__icon-wrap">
            <Icon className="mobile-bottom-nav__icon" aria-hidden="true" />
            {badge > 0 && (
              <span className="mobile-bottom-nav__badge">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          <span className="mobile-bottom-nav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
