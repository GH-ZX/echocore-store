import { Link } from 'react-router-dom';
import { Code2, Mail, Send } from 'lucide-react';
import {
  DEVELOPER,
  OPERATOR,
} from '../lib/buildInfo';
import { formatMessage } from '../lib/i18n';
import { LINKTREE_PATH } from '../lib/socialLinks';

function GitHubIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

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
            href={DEVELOPER.githubUrl}
            accent="#e6edf3"
            icon={GitHubIcon}
            platform="GitHub"
            handle={DEVELOPER.github}
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