import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
  HelpCircle, BookOpen, Mail, ChevronDown, Sparkles, Percent, LayoutGrid,
} from 'lucide-react';
import {
  CATALOG_MENU_PATHS,
  CATALOG_NAV_ITEMS,
  getCatalogNavDesc,
  getCatalogNavLabel,
} from '../../lib/catalogNav';

/* ───── Navigation structure ─────
   - Categories: hover menu (Games, Gift cards, Accounts)
   - Link: Offers
   - Dropdown: More (How it Works, FAQ, Contact) */

export const NAV_ITEMS = [
  {
    type: 'categories',
    icon: LayoutGrid,
    labelKey: 'shopCategories',
    fallbackEn: 'Categories',
    fallbackAr: 'الأقسام',
  },
  { type: 'link', path: '/sale', icon: Percent, labelKey: 'saleOffers', fallbackEn: 'Offers', fallbackAr: 'العروض' },
  {
    type: 'dropdown',
    icon: Sparkles,
    labelKey: 'more',
    fallbackEn: 'More',
    fallbackAr: 'المزيد',
    content: [
      { path: '/how', icon: BookOpen, labelKey: 'howItWorks', fallbackEn: 'How it Works', fallbackAr: 'كيف يعمل' },
      { path: '/faq', icon: HelpCircle, labelKey: 'faq', fallbackEn: 'FAQ', fallbackAr: 'الأسئلة الشائعة' },
      { path: '/contact', icon: Mail, labelKey: 'contact', fallbackEn: 'Contact', fallbackAr: 'اتصل بنا' },
    ],
  },
];

export function getNavLabel(t, lang, item) {
  if (t?.[item.labelKey]) return t[item.labelKey];
  return lang === 'ar' ? item.fallbackAr : item.fallbackEn;
}

/** Flat list of all nav destinations — mobile drawer */
export function getFlatNavLinks(items = NAV_ITEMS) {
  return items.flatMap((item) => {
    if (item.type === 'categories') {
      return CATALOG_NAV_ITEMS.map((sub) => ({
        path: sub.path,
        icon: sub.icon,
        labelKey: sub.labelKey,
        fallbackEn: sub.fallbackEn,
        fallbackAr: sub.fallbackAr,
        group: item.labelKey,
      }));
    }
    if (item.type === 'link') {
      return [{
        path: item.path,
        icon: item.icon,
        labelKey: item.labelKey,
        fallbackEn: item.fallbackEn,
        fallbackAr: item.fallbackAr,
        group: null,
      }];
    }
    if (item.type === 'dropdown') {
      return item.content.map((sub) => ({
        path: sub.path,
        icon: sub.icon,
        labelKey: sub.labelKey,
        fallbackEn: sub.fallbackEn,
        fallbackAr: sub.fallbackAr,
        group: item.labelKey,
      }));
    }
    return [];
  });
}

function triggerClass(active = false, open = false) {
  return [
    'site-nav-trigger',
    active ? 'site-nav-trigger--active' : '',
    open ? 'site-nav-trigger--open' : '',
  ].filter(Boolean).join(' ');
}

function NavGlow({ active }) {
  if (!active) return null;
  return <span className="site-nav-item-glow" aria-hidden="true" />;
}

function useNavDropdownPosition(triggerRef, open) {
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2,
    });
  }, [triggerRef]);

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, updatePosition]);

  return { coords, updatePosition };
}

function useCloseOnNavigate(setOpen) {
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, setOpen]);
}

function NavCategoriesDropdown({ t, lang, navigate, item, isPathActive }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);
  const { coords, updatePosition } = useNavDropdownPosition(triggerRef, open);
  useCloseOnNavigate(setOpen);

  const active = CATALOG_MENU_PATHS.some((path) => isPathActive(path));

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), 140);
  };

  const handleOpen = () => {
    clearCloseTimer();
    updatePosition();
    setOpen(true);
  };

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const Icon = item.icon;

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        className="site-nav-dropdown-portal site-nav-dropdown-portal--categories"
        role="menu"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
        }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <ul className="site-nav-category-list">
          {CATALOG_NAV_ITEMS.map((sub) => {
            const SubIcon = sub.icon;
            const subActive = isPathActive(sub.path);
            const label = getCatalogNavLabel(t, lang, sub);
            const desc = getCatalogNavDesc(t, lang, sub);

            return (
              <li key={sub.path}>
                <button
                  type="button"
                  role="menuitem"
                  className={`site-nav-category-item site-nav-category-item--${sub.accent} ${subActive ? 'site-nav-category-item--active' : ''}`}
                  onClick={() => {
                    navigate(sub.path);
                    setOpen(false);
                  }}
                >
                  <span className={`site-nav-category-icon site-nav-category-icon--${sub.accent}`} aria-hidden="true">
                    <SubIcon className="site-nav-category-icon-svg" strokeWidth={2} />
                  </span>
                  <span className="site-nav-category-copy">
                    <span className="site-nav-category-label">{label}</span>
                    {desc && <span className="site-nav-category-desc">{desc}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>,
      document.body,
    )
    : null;

  return (
    <li
      className="site-nav-item-wrap site-nav-item-wrap--categories"
      onMouseEnter={handleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass(active, open)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          updatePosition();
          setOpen((prev) => !prev);
        }}
      >
        <Icon className="site-nav-trigger-icon" strokeWidth={2} />
        <span>{getNavLabel(t, lang, item)}</span>
        <ChevronDown className="site-nav-chevron" strokeWidth={2.5} aria-hidden="true" />
        <NavGlow active={active} />
      </button>
      {panel}
    </li>
  );
}

function NavMoreDropdown({ t, lang, navigate, item, isPathActive, isGroupActive }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const { coords, updatePosition } = useNavDropdownPosition(triggerRef, open);
  useCloseOnNavigate(setOpen);

  const active = isGroupActive(item);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (
        triggerRef.current?.contains(event.target)
        || panelRef.current?.contains(event.target)
      ) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const Icon = item.icon;

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        className="site-nav-dropdown-portal"
        role="menu"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
        }}
      >
        <ul className="site-nav-dropdown-inner">
          {item.content.map((sub) => {
            const SubIcon = sub.icon;
            const subActive = isPathActive(sub.path);
            return (
              <li key={sub.path}>
                <button
                  type="button"
                  role="menuitem"
                  className={`site-nav-dropdown-item ${subActive ? 'site-nav-dropdown-item--active' : ''}`}
                  onClick={() => {
                    navigate(sub.path);
                    setOpen(false);
                  }}
                >
                  <SubIcon className="site-nav-dropdown-icon" strokeWidth={2} />
                  <span className="site-nav-dropdown-label">{getNavLabel(t, lang, sub)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>,
      document.body,
    )
    : null;

  return (
    <li className="site-nav-item-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass(active, open)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          updatePosition();
          setOpen((prev) => !prev);
        }}
      >
        <Icon className="site-nav-trigger-icon" strokeWidth={2} />
        <span>{getNavLabel(t, lang, item)}</span>
        <ChevronDown className="site-nav-chevron" strokeWidth={2.5} aria-hidden="true" />
        <NavGlow active={active} />
      </button>
      {panel}
    </li>
  );
}

export default function SiteNav({ t, lang, navigate, className = '' }) {
  const location = useLocation();

  const isPathActive = (path) => location.pathname === path;

  const isGroupActive = (item) =>
    item.type === 'dropdown' && item.content.some((sub) => isPathActive(sub.path));

  return (
    <nav className={`site-nav-root ${className}`} dir="ltr" aria-label="Main">
      <ul className="site-nav-list">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          if (item.type === 'categories') {
            return (
              <NavCategoriesDropdown
                key={item.labelKey}
                t={t}
                lang={lang}
                navigate={navigate}
                item={item}
                isPathActive={isPathActive}
              />
            );
          }

          if (item.type === 'link') {
            const active = isPathActive(item.path);
            return (
              <li key={item.path} className="site-nav-item-wrap">
                <Link
                  to={item.path}
                  className={triggerClass(active)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="site-nav-trigger-icon" strokeWidth={2} />
                  <span>{getNavLabel(t, lang, item)}</span>
                  <NavGlow active={active} />
                </Link>
              </li>
            );
          }

          if (item.type === 'dropdown') {
            return (
              <NavMoreDropdown
                key={item.labelKey}
                t={t}
                lang={lang}
                navigate={navigate}
                item={item}
                isPathActive={isPathActive}
                isGroupActive={isGroupActive}
              />
            );
          }

          return null;
        })}
      </ul>
    </nav>
  );
}

/** Mobile drawer navigation — flat list, no nested dropdown */
export function MobileNavLinks({ t, lang, location, onNavigate, linkClassName = 'mobile-nav-link' }) {
  const links = getFlatNavLinks();

  return (
    <ul className="mobile-nav-list" role="list">
      {links.map((link) => {
        const Icon = link.icon;
        const active = location.pathname === link.path;
        return (
          <li key={link.path}>
            <button
              type="button"
              onClick={() => onNavigate(link.path)}
              className={`${linkClassName} ${active ? 'mobile-nav-link--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="mobile-nav-link-icon" strokeWidth={2} />
              <span>{getNavLabel(t, lang, link)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}