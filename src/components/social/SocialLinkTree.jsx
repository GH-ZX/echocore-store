import SocialLinkIcon from './SocialLinkIcon';
import { SOCIAL_LINKS, getSocialLinkLabel } from '../../lib/socialLinks';

export default function SocialLinkTree({ lang = 'en', compact = false }) {
  const isAr = lang === 'ar';

  return (
    <div className={`social-link-tree ${compact ? 'social-link-tree--compact' : ''}`}>
      <div className="space-y-3">
        {SOCIAL_LINKS.map((link) => (
          <a
            key={link.id}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={getSocialLinkLabel(link, lang)}
            className="social-link-tree__item group"
            style={{ '--social-accent': link.accent }}
          >
            <span className="social-link-tree__icon">
              <SocialLinkIcon id={link.id} className="w-5 h-5" />
            </span>
            <span className="social-link-tree__text min-w-0 flex-1">
              <span className="social-link-tree__platform block font-semibold truncate">
                {link.platform}
              </span>
              <span className="social-link-tree__handle block text-xs opacity-80 truncate" dir="ltr">
                {link.handle}
              </span>
            </span>
            <span className="social-link-tree__arrow text-xs opacity-60 group-hover:opacity-100 transition-opacity">
              {isAr ? '←' : '→'}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}