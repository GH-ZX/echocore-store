import { Link } from 'react-router-dom';
import EchoLogo from '../components/ui/EchoLogo';
import SocialLinkTree from '../components/social/SocialLinkTree';
import {
  getSocialLinkTreeSubtitle,
  getSocialLinkTreeTitle,
} from '../lib/socialLinks';

export default function LinksView({ t = {}, lang = 'en' }) {
  const isAr = lang === 'ar';

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
          {t.socialLinksTitle || getSocialLinkTreeTitle(lang)}
        </h1>
        <p className="text-sm text-[var(--text-sec)] leading-relaxed">
          {t.socialLinksSubtitle || getSocialLinkTreeSubtitle(lang)}
        </p>
      </div>

      <SocialLinkTree lang={lang} />

      <div className="mt-8 text-center">
        <Link to="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
          {isAr ? 'العودة للمتجر' : 'Back to store'}
        </Link>
      </div>
    </div>
  );
}