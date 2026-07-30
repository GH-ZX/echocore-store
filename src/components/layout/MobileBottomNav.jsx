import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Gamepad2, Search, ShoppingCart, User } from 'lucide-react';

/** Paths where the storefront bottom nav must stay out of the way. */
const HIDDEN_PREFIXES = ['/dashboard', '/banned', '/checkout', '/buy/'];

function isHiddenPath(pathname = '') {
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  // Offer purchase flow has its own sticky buy bar
  return pathname.endsWith('/buy');
}

function isItemActive(item, pathname) {
  if (item.exact) return pathname === item.to;
  return pathname.startsWith(item.to);
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
    <nav className="mobile-bottom-nav md:!hidden" aria-label={t.mainNavLabel || t.home}>
      <div className="mobile-bottom-nav__glass">
        {items.map((item) => {
          const { id, to, label, icon: Icon, badge, exact } = item;
          const active = isItemActive(item, pathname);
          return (
            <NavLink
              key={id}
              to={to}
              end={exact}
              className={`mobile-bottom-nav__item${
                active ? ' mobile-bottom-nav__item--active' : ''
              }`}
            >
              {active && (
                <motion.span
                  layoutId="mobile-bottom-nav-pill"
                  className="mobile-bottom-nav__pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  aria-hidden="true"
                />
              )}
              <motion.span
                className="mobile-bottom-nav__icon-wrap"
                animate={active ? { y: -1.5, scale: 1.08 } : { y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                <Icon className="mobile-bottom-nav__icon" aria-hidden="true" />
                {badge > 0 && (
                  <span className="mobile-bottom-nav__badge">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </motion.span>
              <span className="mobile-bottom-nav__label">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
