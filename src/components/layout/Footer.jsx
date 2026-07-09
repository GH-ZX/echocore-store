import React from 'react';
import { Link } from 'react-router-dom';
import EchoLogo from '../ui/EchoLogo';

export default function Footer({ lang = 'en' }) {
  const isAr = lang === 'ar';

  // Bilingual content
  const content = {
    desc: isAr
      ? 'الوجهة الأولى للاعبي الألعاب. شحن فوري وآمن 100% لألعابك المفضلة.'
      : 'The ultimate destination for PC gamers. Instant & 100% secure top-ups.',
    shop: isAr ? 'التسوق' : 'Shop',
    support: isAr ? 'الدعم' : 'Support',
    company: isAr ? 'الشركة' : 'Company',
    follow: isAr ? 'تابعنا' : 'Follow Us',
    links: {
      games: isAr ? 'جميع الألعاب' : 'All Games',
      sales: isAr ? 'عروض الخصم' : 'Sale Offers',
      how: isAr ? 'كيف يعمل' : 'How it Works',
      contact: isAr ? 'اتصل بنا' : 'Contact Us',
      faq: isAr ? 'الأسئلة الشائعة' : 'FAQ',
      about: isAr ? 'من نحن' : 'About Us',
      privacy: isAr ? 'سياسة الخصوصية' : 'Privacy Policy',
      terms: isAr ? 'شروط الخدمة' : 'Terms of Service',
    },
    copyright: isAr
      ? '© 2026 ECHOCORE Store. جميع الحقوق محفوظة.'
      : '© 2026 ECHOCORE Store. All rights reserved.',
    tagline: isAr ? 'تسليم فوري • دفع آمن • دعم عربي وإنجليزي' : 'Instant delivery • Secure payments • Arabic & English support',
  };

  const socials = [
    {
      name: 'Instagram',
      href: 'https://instagram.com/echocore',
      label: isAr ? 'تابعنا على إنستغرام' : 'Follow us on Instagram',
      Icon: ({ className }) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      ),
    },
    {
      name: 'Discord',
      href: 'https://discord.gg/echocore',
      label: isAr ? 'انضم إلى سيرفر ديسكورد' : 'Join our Discord',
      Icon: ({ className }) => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0551c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9494-1.5219 6.0028-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1569 2.4189z" />
        </svg>
      ),
    },
    {
      name: 'Telegram',
      href: 'https://t.me/kiritostore412',
      label: isAr ? 'تابعنا على تليجرام' : 'Follow us on Telegram',
      Icon: ({ className }) => (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L9.78 18.65z" />
        </svg>
      ),
    },
    {
      name: 'Facebook',
      href: 'https://facebook.com/echocore',
      label: isAr ? 'تابعنا على فيسبوك' : 'Follow us on Facebook',
      Icon: ({ className }) => (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
        </svg>
      ),
    },
  ];

  return (
    <footer className="border-t border-[var(--border)]/30 bg-transparent pt-10 pb-8 text-sm backdrop-blur-[2px]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Main footer grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
          {/* Brand */}
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

          {/* Shop */}
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

          {/* Support */}
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

          {/* Follow Us + Social Icons */}
          <div>
            <div className="font-semibold text-white mb-3 tracking-tight">{content.follow}</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {socials.map((social, index) => {
                const { href, Icon, label } = social;
                return (
                  <a
                    key={index}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="group flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)]/40 bg-[var(--bg-surface)]/40 text-[var(--text-secondary)] backdrop-blur-sm transition-all hover:border-[var(--accent)]/60 hover:text-[var(--accent)] hover:bg-[var(--bg-surface)]/60 active:scale-95"
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </a>
                );
              })}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{isAr ? 'انضم إلى مجتمع اللاعبين' : 'Join our community of gamers'}</div>
          </div>
        </div>

        {/* Bottom bar */}
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
