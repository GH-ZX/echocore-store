import { Link, useLocation } from 'react-router-dom';
import {
  HelpCircle, BookOpen, Mail, Sparkles, Percent,
} from 'lucide-react';
import {
  CATALOG_NAV_ITEMS,
  getCatalogNavLabel,
  getCatalogNavShortLabel,
} from '../../lib/catalogNav';

/* ───── Navigation structure ─────
   Desktop: catalog lanes + Offers (direct links)
   Mobile drawer: catalog + Offers + FAQ */

const MOBILE_NAV_EXCLUDED_PATHS = new Set(['/how', '/contact']);

const SALE_NAV_ITEM = {
  type: 'link',
  path: '/sale',
  icon: Percent,
  labelKey: 'saleOffers',
  fallbackEn: 'Offers',
  fallbackAr: 'العروض',
};

export const NAV_ITEMS = [
  SALE_NAV_ITEM,
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

function catalogToNavLink(sub, { shortLabel = false } = {}) {
  return {
    type: 'link',
    path: sub.path,
    icon: sub.icon,
    labelKey: sub.labelKey,
    shortLabelKey: sub.shortLabelKey,
    fallbackEn: sub.fallbackEn,
    fallbackAr: sub.fallbackAr,
    accent: sub.accent,
    shortLabel,
  };
}

export function buildNavItems(hasSaleOffers = true, { surface = 'desktop' } = {}) {
  const catalogLinks = CATALOG_NAV_ITEMS.map((sub) => catalogToNavLink(sub, {
    shortLabel: surface === 'desktop',
  }));

  const extra = NAV_ITEMS.filter((item) => {
    if (item.type === 'link' && item.path === '/sale') return hasSaleOffers;
    if (surface === 'desktop' && item.type === 'dropdown') return false;
    return true;
  });

  return [...catalogLinks, ...extra];
}

export function getNavLabel(t, lang, item) {
  if (item.shortLabel && item.shortLabelKey && t?.[item.shortLabelKey]) {
    return t[item.shortLabelKey];
  }
  if (item.shortLabelKey && !item.labelKey && t?.[item.shortLabelKey]) {
    return t[item.shortLabelKey];
  }
  if (t?.[item.labelKey]) return t[item.labelKey];
  return lang === 'ar' ? item.fallbackAr : item.fallbackEn;
}

/** Flat list of all nav destinations — mobile drawer */
export function getFlatNavLinks(items = buildNavItems(true, { surface: 'mobile' })) {
  return items.flatMap((item) => {
    if (item.type === 'link') {
      return [{
        path: item.path,
        icon: item.icon,
        labelKey: item.labelKey,
        shortLabelKey: item.shortLabelKey,
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
  }).filter((link) => !MOBILE_NAV_EXCLUDED_PATHS.has(link.path));
}

function triggerClass(active = false, accent = '') {
  return [
    'site-nav-trigger',
    accent ? `site-nav-trigger--${accent}` : '',
    active ? 'site-nav-trigger--active' : '',
  ].filter(Boolean).join(' ');
}

function NavGlow({ active }) {
  if (!active) return null;
  return <span className="site-nav-item-glow" aria-hidden="true" />;
}

function NavIcon({ Icon, accent }) {
  if (!accent) {
    return <Icon className="site-nav-trigger-icon" strokeWidth={2} />;
  }
  return (
    <span className={`site-nav-trigger-icon-box site-nav-trigger-icon-box--${accent}`} aria-hidden="true">
      <Icon className="site-nav-trigger-icon" strokeWidth={2} />
    </span>
  );
}

function NavLinkItem({ item, t, lang, active }) {
  const Icon = item.icon;
  const label = item.catalogItem
    ? (item.shortLabel
      ? getCatalogNavShortLabel(t, lang, item.catalogItem)
      : getCatalogNavLabel(t, lang, item.catalogItem))
    : getNavLabel(t, lang, item);

  return (
    <li className="site-nav-item-wrap">
      <Link
        to={item.path}
        className={triggerClass(active, item.accent)}
        aria-current={active ? 'page' : undefined}
      >
        <NavIcon Icon={Icon} accent={item.accent} />
        <span className="site-nav-trigger-label">{label}</span>
        <NavGlow active={active} />
      </Link>
    </li>
  );
}

export default function SiteNav({ t, lang, className = '', hasSaleOffers = true }) {
  const location = useLocation();
  const navItems = buildNavItems(hasSaleOffers, { surface: 'desktop' });

  const isPathActive = (path) => location.pathname === path;

  return (
    <nav className={`site-nav-root ${className}`} dir="ltr" aria-label="Main">
      <ul className="site-nav-list">
        {navItems.map((item) => {
          if (item.type !== 'link') return null;

          const catalogItem = CATALOG_NAV_ITEMS.find((entry) => entry.path === item.path);
          const navItem = catalogItem
            ? { ...item, catalogItem }
            : item;

          return (
            <NavLinkItem
              key={item.path}
              item={navItem}
              t={t}
              lang={lang}
              active={isPathActive(item.path)}
            />
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile drawer navigation — flat list */
export function MobileNavLinks({
  t,
  lang,
  location,
  onNavigate,
  linkClassName = 'mobile-nav-link',
  hasSaleOffers = true,
}) {
  const links = getFlatNavLinks(buildNavItems(hasSaleOffers, { surface: 'mobile' }));

  return (
    <ul className="mobile-nav-list" role="list">
      {links.map((link) => {
        const Icon = link.icon;
        const active = location.pathname === link.path;
        const catalogItem = CATALOG_NAV_ITEMS.find((entry) => entry.path === link.path);
        const label = catalogItem
          ? getCatalogNavLabel(t, lang, catalogItem)
          : getNavLabel(t, lang, link);

        return (
          <li key={link.path}>
            <button
              type="button"
              onClick={() => onNavigate(link.path)}
              className={`${linkClassName} ${active ? 'mobile-nav-link--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="mobile-nav-link-icon" strokeWidth={2} />
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}