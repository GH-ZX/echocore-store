import { useState, useEffect } from 'react';
import echoCoreLogo from '../../assets/echo-core-logo-sm.png';
import { getActiveLogoUrl } from '../../lib/theme';

export default function EchoLogo({ className = 'w-10 h-10', alt = 'ECHOCORE', src }) {
  const [themeLogoUrl, setThemeLogoUrl] = useState(() => getActiveLogoUrl());

  useEffect(() => {
    const sync = () => setThemeLogoUrl(getActiveLogoUrl());
    sync();
    window.addEventListener('themechange', sync);
    return () => window.removeEventListener('themechange', sync);
  }, []);

  const resolvedSrc = src || themeLogoUrl || echoCoreLogo;

  return (
    <span className={`echo-logo-frame overflow-hidden flex-shrink-0 ${className}`}>
      <img
        src={resolvedSrc}
        alt={alt}
        width={128}
        height={128}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        className="echo-logo"
        draggable={false}
        onError={(e) => {
          if (e.currentTarget.src !== echoCoreLogo) {
            e.currentTarget.src = echoCoreLogo;
          }
        }}
      />
    </span>
  );
}