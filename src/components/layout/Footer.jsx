import React from 'react';
import { Link } from 'react-router-dom';
import EchoLogo from '../ui/EchoLogo';
import SocialLinkIcon from '../social/SocialLinkIcon';
import {
  LINKTREE_PATH,
  SOCIAL_LINKS,
  getSocialLinkLabel,
} from '../../lib/socialLinks';

export default function Footer({ lang = 'en', t = {} }) {
  const isAr = lang === 'ar';

  const content = {
    desc: isAr
      ? 'الوجهة الأولى للاعبي الألعاب. شحن فوري وآمن 100% لألعابك المفضلة.'
      : 'The ultimate destination for PC gamers. Instant & 100% secure top-ups.',
    shop: isAr ? 'التسوق' : 'Shop',
    support: isAr ? 'الدعم' : 'Support',
    follow: isAr ? 'تابعنا' : 'Follow Us',
    links: {
      games: isAr ? 'الألعاب' : 'Games',
      sales: isAr ? 'عروض الخصم' : 'Sale Offers',
      how: isAr ? 'كيف يعمل' : 'How it Works',
      contact: isAr ? 'اتصل بنا' : 'Contact Us',
      faq: isAr ? 'الأسئلة الشائعة' : 'FAQ',
      privacy: isAr ? 'سياسة الخصوصية' : 'Privacy Policy',
      terms: isAr ? 'شروط الخدمة' : 'Terms of Service',
      socialHub: t.allSocialLinks || (isAr ? 'كل روابطنا' : 'All our links'),
    },
    copyright: isAr
      ? '© 2026 ECHOCORE Store. جميع الحقوق محفوظة.'
      : '© 2026 ECHOCORE Store. All rights reserved.',
    tagline: isAr ? 'تسليم فوري • دفع آمن • دعم عربي وإنجليزي' : 'Instant delivery • Secure payments • Arabic & English support',
    community: isAr ? 'انضم إلى مجتمع اللاعبين' : 'Join our community of gamers',
  };

  return (
    <footer className="border-t border-[var(--border)]/30 bg-transparent pt-10 pb-8 text-sm backdrop-blur-[2px]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
          <div>
            <Link to="/" className="flex items-center gap-3 group mb-4">
              <EchoLogo className="w-9 h-9 md:w-10 md:h-10 transition-transform group-hover:scale-105" />
              <div className="flex flex-col">
                <span className="text-lg md:text-xl font-black tracking-[1px] text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-blue-400">
                  ECHOCORE
                </span>
                <span className="text-[9px] text-[var(--accent)]/60 tracking-[2px] font-semibold -mt-1">STORE</span>
              </div>
            </Link>
            <p className="text-[var(--text-secondary)] leading-relaxed pr-2 text-[13px]">
              {content.desc}
            </p>
            <p className="mt-3 text-xs text-[var(--text-muted)] leading-relaxed">
              {content.tagline}
            </p>
          </div>

          <div>
            <div className="font-semibold text-white mb-3 tracking-tight">{content.shop}</div>
            <ul className="space-y-[9px] text-[var(--text-secondary)]">
              <li>
                <Link to="/games" className="hover:text-[var(--accent)] transition-colors">{content.links.games}</Link>
              </li>
              <li>
                <Link to="/sale" className="hover:text-[var(--accent)] transition-colors">{content.links.sales}</Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-white mb-3 tracking-tight">{content.support}</div>
            <ul className="space-y-[9px] text-[var(--text-secondary)]">
              <li>
                <Link to="/how" className="hover:text-[var(--accent)] transition-colors">{content.links.how}</Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-[var(--accent)] transition-colors">{content.links.contact}</Link>
              </li>
              <li>
                <Link to="/faq" className="hover:text-[var(--accent)] transition-colors">{content.links.faq}</Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-white mb-3 tracking-tight">{content.follow}</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.id}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={getSocialLinkLabel(social, lang)}
                  title={`${social.platform} ${social.handle}`}
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)]/40 bg-[var(--bg-surface)]/40 text-[var(--text-secondary)] backdrop-blur-sm transition-all hover:border-[var(--accent)]/60 hover:text-[var(--accent)] hover:bg-[var(--bg-surface)]/60 active:scale-95"
                >
                  <SocialLinkIcon id={social.id} className="h-4.5 w-4.5" />
                </a>
              ))}
            </div>
            <Link
              to={LINKTREE_PATH}
              className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors text-xs font-semibold"
            >
              {content.links.socialHub}
              <span aria-hidden="true">{isAr ? '←' : '→'}</span>
            </Link>
            <div className="text-[10px] text-[var(--text-muted)] mt-2">{content.community}</div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-y-3 text-xs text-[var(--text-muted)]">
          <p>{content.copyright}</p>
          <div className="flex items-center gap-x-5">
            <Link to="/privacy" className="hover:text-[var(--text-secondary)] transition-colors">{content.links.privacy}</Link>
            <Link to="/terms" className="hover:text-[var(--text-secondary)] transition-colors">{content.links.terms}</Link>
            <span className="hidden sm:inline">•</span>
            <span>Secure • Instant • Trusted</span>
          </div>
        </div>
      </div>
    </footer>
  );
}