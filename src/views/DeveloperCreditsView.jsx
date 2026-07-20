import { Link } from 'react-router-dom';
import { Code2, Mail, Send } from 'lucide-react';
import {
  DEVELOPER,
  OPERATOR,
} from '../lib/buildInfo';
import { formatMessage } from '../lib/i18n';
import { LINKTREE_PATH } from '../lib/socialLinks';
import SocialLinkIcon from '../components/social/SocialLinkIcon';

function DeveloperContactLink({ href, accent, icon: Icon, platform, handle, external = true }) {
  const className = 'developer-contact-link';

  const content = (
    <>
      <span className="developer-contact-link__icon" style={{ '--social-accent': accent }}>
        <Icon className="w-5 h-5" strokeWidth={2} />
      </span>
      <span className="developer-contact-link__body">
        <span className="developer-contact-link__platform">{platform}</span>
        <span className="developer-contact-link__handle" dir="ltr">{handle}</span>
      </span>
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={{ '--social-accent': accent }}
      >
        {content}
      </a>
    );
  }

  return (
    <a href={href} className={className} style={{ '--social-accent': accent }}>
      {content}
    </a>
  );
}

function InstagramIcon({ className = 'w-5 h-5' }) {
  return <SocialLinkIcon id="instagram" className={className} />;
}

export default function DeveloperCreditsView({ t = {}, lang = 'ar' }) {
  const devName = lang === 'ar' ? DEVELOPER.nameAr : DEVELOPER.name;
  const operatorName = lang === 'ar' ? OPERATOR.nameAr : OPERATOR.name;
  const proudMessage = formatMessage(t.developerPageProud, { operator: operatorName });

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-14 animate-fade-in">
      <div className="card p-6 sm:p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] mb-5">
          <Code2 className="w-7 h-7" strokeWidth={2} />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black mb-3">{devName}</h1>
        <p className="text-sm text-[var(--text-sec)] leading-relaxed mb-6">
          {proudMessage}
        </p>

        <div className="developer-contact-list">
          <DeveloperContactLink
            href={DEVELOPER.telegramUrl}
            accent="#26A5E4"
            icon={Send}
            platform="Telegram"
            handle={DEVELOPER.telegram}
          />
          <DeveloperContactLink
            href={`mailto:${DEVELOPER.email}`}
            accent="var(--accent)"
            icon={Mail}
            platform="Email"
            handle={DEVELOPER.email}
            external={false}
          />
          <DeveloperContactLink
            href={DEVELOPER.instagramUrl}
            accent="#E1306C"
            icon={InstagramIcon}
            platform="Instagram"
            handle={DEVELOPER.instagram}
          />
        </div>

        <p className="text-[11px] text-[var(--text-muted)] mt-6 leading-relaxed">
          {t.developerPageNote}
        </p>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm">
        <Link
          to={LINKTREE_PATH}
          className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          {t.socialLinksTitle}
        </Link>
        <span className="hidden sm:inline text-[var(--text-muted)]">•</span>
        <Link to="/" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
          {t.backToStore}
        </Link>
      </div>
    </div>
  );
}
