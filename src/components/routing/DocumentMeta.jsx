import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyDocumentMeta, resolveRouteMeta } from '../../lib/documentMeta';

/**
 * Updates <title>, description, OG tags on every client route change.
 */
export default function DocumentMeta({ t = {}, lang = 'ar', games = [] }) {
  const location = useLocation();

  useEffect(() => {
    const meta = resolveRouteMeta(location.pathname, t, lang, games);
    applyDocumentMeta(meta);
  }, [location.pathname, t, lang, games]);

  return null;
}
