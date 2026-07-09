import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import SocialLinkIcon from '../social/SocialLinkIcon';
import { LINKTREE_PATH, SOCIAL_LINKS } from '../../lib/socialLinks';

export default function SocialLinksHomeSection({ section, lang = 'en', t = {} }) {
  const isAr = lang === 'ar';
  const title = isAr
    ? (section.title_ar || t.socialLinksTitle)
    : (section.title_en || t.socialLinksTitle);
  const buttonText = isAr
    ? (section.button_text_ar || t.socialLinksButton)
    : (section.button_text_en || t.socialLinksButton);
  const subtitle = isAr
    ? (section.subtitle_ar || t.socialLinksHomeHint)
    : (section.subtitle_en || t.socialLinksHomeHint);

  const featured = SOCIAL_LINKS.filter((link) => link.id === 'youtube' || link.id === 'tiktok');

  return (
    <section className="social-links-home-section text-center">
      <h2 className="section-heading mb-2">
        <span className="sale-offers-title text-xl md:text-2xl font-bold">{title}</span>
      </h2>
      <div className="sale-offers-divider h-px w-10 mx-auto mb-4" />
      {subtitle && (
        <p className="text-sm text-[var(--text-sec)] mb-5 max-w-lg mx-auto">{subtitle}</p>
      )}

      <div className="flex items-center justify-center gap-2 mb-5">
        {featured.map((link) => (
          <span
            key={link.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-surface)]/50 px-3 py-1.5 text-xs text-[var(--text-sec)]"
            dir="ltr"
          >
            <SocialLinkIcon id={link.id} className="w-4 h-4" />
            {link.handle}
          </span>
        ))}
      </div>

      <Link
        to={LINKTREE_PATH}
        className="btn btn-primary inline-flex items-center gap-2 px-8 py-3.5 text-base font-bold"
      >
        {buttonText}
        <ExternalLink className="w-4 h-4" />
      </Link>
    </section>
  );
}