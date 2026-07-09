import { Link } from 'react-router-dom';
import EchoLogo from '../components/ui/EchoLogo';
import SocialLinkTree from '../components/social/SocialLinkTree';
import { DEVELOPER_PAGE_PATH } from '../lib/buildInfo';

export default function LinksView({ t = {}, lang = 'en' }) {
  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-14 animate-fade-in">
      <div className="text-center mb-8">
        <Link to="/" className="inline-flex flex-col items-center gap-3 group mb-5">
          <EchoLogo className="w-16 h-16 transition-transform group-hover:scale-105" />
          <div>
            <div className="text-2xl font-black tracking-[1px] text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-blue-400">
              ECHOCORE
            </div>
            <div className="text-[10px] text-[var(--accent)]/60 tracking-[2px] font-semibold -mt-0.5">
              STORE
            </div>
          </div>
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black mb-2">
          {t.socialLinksTitle}
        </h1>
        <p className="text-sm text-[var(--text-sec)] leading-relaxed">
          {t.socialLinksSubtitle}
        </p>
      </div>

      <SocialLinkTree lang={lang} t={t} />

      <div className="mt-8 flex flex-col items-center gap-4">
        <Link
          to={DEVELOPER_PAGE_PATH}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]/60 bg-[var(--bg-surface)]/35 px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:border-[var(--accent)]/35 hover:text-[var(--accent)] transition-colors"
        >
          {t.developerPageButton}
        </Link>
        <Link to="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
          {t.backToStore}
        </Link>
      </div>
    </div>
  );
}