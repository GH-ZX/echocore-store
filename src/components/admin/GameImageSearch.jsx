import { useState, useEffect, useCallback } from 'react';
import { ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { searchGameImages } from '../../lib/gameImageSearch';

const QUICK_SUFFIXES = ['', 'game', 'wallpaper', 'key art'];

export default function GameImageSearch({
  gameName = '',
  onSelectCover,
  onSelectLogo,
  t = {},
  lang = 'en',
}) {
  const isAr = lang === 'ar';
  const [query, setQuery] = useState(gameName);
  const [loading, setLoading] = useState(false);
  const [covers, setCovers] = useState([]);
  const [logos, setLogos] = useState([]);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({ hasRawgKey: false, hasSteamGridKey: false, sourcesUsed: [], totalFound: 0 });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('covers');

  useEffect(() => {
    if (gameName) setQuery(gameName);
  }, [gameName]);

  const runSearch = useCallback(async (searchQuery, deep = true) => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setError(isAr ? 'اكتب اسم اللعبة للبحث' : 'Enter a game name to search');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await searchGameImages(q, { deep });
      setCovers(data.covers || []);
      setLogos(data.logos || []);
      setMeta({
        hasRawgKey: data.hasRawgKey,
        hasSteamGridKey: data.hasSteamGridKey,
        sourcesUsed: data.sourcesUsed || [],
        totalFound: data.totalFound || 0,
      });

      if (!data.covers?.length && !data.logos?.length) {
        setError(
          isAr
            ? 'لم يتم العثور على صور. جرّب اقتراحًا أدناه أو ارفع يدويًا.'
            : 'No images found. Try a suggestion below or upload manually.'
        );
      } else {
        setTab(data.covers?.length ? 'covers' : 'logos');
      }
    } catch (err) {
      setError(err.message || (isAr ? 'فشل البحث' : 'Search failed'));
      setCovers([]);
      setLogos([]);
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const handleSearch = () => runSearch(query, true);

  const quickQueries = gameName
    ? [...new Set(QUICK_SUFFIXES.map((s) => (s ? `${gameName} ${s}` : gameName)))]
    : [];

  const displayList = tab === 'covers' ? covers : logos;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          {t.findImagesOnline || (isAr ? 'البحث المتقدم عن صور' : 'Advanced image search')}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] font-normal">
          {t.optional || (isAr ? 'اختياري' : 'optional')}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--text-muted)] pt-2 leading-relaxed">
            {t.imageSearchHelpAdvanced || (isAr
              ? 'يبحث في RAWG وSteam وWikimedia والويب عن غلافات وشاشات عرض — وليس الشعارات فقط. الرفع اليدوي لا يزال متاحًا.'
              : 'Searches RAWG, Steam, Wikimedia & the web for covers, heroes & screenshots — not just logos. Manual upload still available.')}
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
              placeholder={t.searchGameImages || (isAr ? 'مثال: Valorant' : 'e.g. Valorant')}
              className="input flex-1 text-sm"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="btn btn-primary px-3 flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t.deepSearch || (isAr ? 'بحث عميق' : 'Deep search')}
            </button>
          </div>

          {quickQueries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quickQueries.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setQuery(q); runSearch(q, true); }}
                  className="text-[10px] px-2 py-1 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {(!meta.hasRawgKey || !meta.hasSteamGridKey) && (
            <div className="text-[10px] text-amber-400/90 space-y-0.5 leading-relaxed">
              {!meta.hasRawgKey && (
                <p>{t.rawgKeyHint || 'Add VITE_RAWG_API_KEY to .env for best PC game art (free at rawg.io)'}</p>
              )}
              {!meta.hasSteamGridKey && (
                <p>{t.steamgridKeyHint || 'Add VITE_STEAMGRIDDB_API_KEY for hero banners & covers (free at steamgriddb.com)'}</p>
              )}
            </div>
          )}

          {meta.sourcesUsed?.length > 0 && (
            <p className="text-[10px] text-[var(--text-muted)]">
              {isAr ? 'المصادر:' : 'Sources:'} {meta.sourcesUsed.join(' • ')}
              {meta.totalFound > 0 && ` — ${meta.totalFound} ${isAr ? 'نتيجة' : 'found'}`}
            </p>
          )}

          {(covers.length > 0 || logos.length > 0) && (
            <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setTab('covers')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${tab === 'covers' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
              >
                {t.coversTab || (isAr ? `أغلفة (${covers.length})` : `Covers (${covers.length})`)}
              </button>
              <button
                type="button"
                onClick={() => setTab('logos')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${tab === 'logos' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
              >
                {t.logosTab || (isAr ? `شعارات (${logos.length})` : `Logos (${logos.length})`)}
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {displayList.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[320px] overflow-y-auto pr-0.5">
              {displayList.map((item) => (
                <div
                  key={item.url}
                  className="group relative rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--bg-surface)] hover:border-[var(--accent)]/40 transition-colors"
                >
                  <div className="relative h-24 sm:h-28 bg-black/40">
                    <img
                      src={item.thumb || item.url}
                      alt={item.title}
                      className={`w-full h-full ${tab === 'logos' ? 'object-contain p-1' : 'object-cover'}`}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                    />
                    <span className="absolute top-1 left-1 text-[7px] font-bold uppercase px-1 py-0.5 rounded bg-black/70 text-white/90">
                      {item.source}
                    </span>
                    {item.width > 0 && (
                      <span className="absolute bottom-1 right-1 text-[7px] font-mono px-1 py-0.5 rounded bg-black/70 text-white/70">
                        {item.width}×{item.height}
                      </span>
                    )}
                  </div>
                  <div className="p-1.5 space-y-1">
                    <p className="text-[9px] text-[var(--text-muted)] truncate leading-tight" title={item.title}>
                      {item.title}
                    </p>
                    <div className="flex gap-1">
                      {tab === 'covers' ? (
                        <button
                          type="button"
                          onClick={() => onSelectCover?.(item.url)}
                          className="flex-1 text-[9px] font-bold py-1.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 border border-[var(--accent)]/30"
                        >
                          {t.useAsCover || (isAr ? 'استخدم كغلاف' : 'Use as cover')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectLogo?.(item.url)}
                          className="flex-1 text-[9px] font-bold py-1.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 border border-[var(--accent)]/30"
                        >
                          {t.useAsLogo || (isAr ? 'استخدم كشعار' : 'Use as logo')}
                        </button>
                      )}
                      {tab === 'covers' && (
                        <button
                          type="button"
                          onClick={() => onSelectLogo?.(item.url)}
                          className="text-[9px] font-bold py-1.5 px-2 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--accent)] border border-[var(--border)]"
                          title={t.useAsLogo || 'Logo'}
                        >
                          {isAr ? 'شعار' : 'Logo'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !covers.length && !logos.length && !error && (
            <p className="text-[10px] text-center text-[var(--text-muted)] py-2">
              {isAr ? 'اضغط "بحث عميق" للبدء' : 'Press "Deep search" to start'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}