import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { searchGameImages } from '../../lib/gameImageSearch';
import { igdbFirstNameQuery } from '../../lib/igdb';

export default function GameImageSearch({
  gameName = '',
  onSelectCover,
  onSelectLogo,
  t = {},
}) {
  const firstNameHint = useMemo(() => igdbFirstNameQuery(gameName), [gameName]);
  const [query, setQuery] = useState(gameName || firstNameHint);
  const [loading, setLoading] = useState(false);
  const [covers, setCovers] = useState([]);
  const [logos, setLogos] = useState([]);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({
    hasIgdbKey: false,
    sourcesUsed: [],
    totalFound: 0,
  });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('covers');

  useEffect(() => {
    if (gameName) setQuery(gameName);
  }, [gameName]);

  const runSearch = useCallback(async (searchQuery) => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setError(t.igdbSearchMinChars);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await searchGameImages(q, { deep: true });
      setCovers(data.covers || []);
      setLogos(data.logos || []);
      setMeta({
        hasIgdbKey: !!data.hasIgdbKey,
        sourcesUsed: data.sourcesUsed || [],
        totalFound: data.totalFound || 0,
      });

      if (data.error && !data.covers?.length && !data.logos?.length) {
        setError(data.error);
      } else if (!data.covers?.length && !data.logos?.length) {
        setError(t.igdbNoImages);
      } else {
        setTab(data.covers?.length ? 'covers' : 'logos');
      }
    } catch (err) {
      setError(err.message || t.igdbSearchFailed);
      setCovers([]);
      setLogos([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleSearch = () => runSearch(query);
  const displayList = tab === 'covers' ? covers : logos;

  const chips = useMemo(() => {
    const list = [];
    if (firstNameHint) list.push(firstNameHint);
    if (gameName && gameName !== firstNameHint) list.push(gameName);
    return [...new Set(list.filter(Boolean))];
  }, [firstNameHint, gameName]);

  return (
    <div className="igdb-search">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="igdb-search__toggle"
        aria-expanded={open}
      >
        <span className="igdb-search__toggle-lead">
          <ImageIcon className="w-4 h-4 shrink-0" aria-hidden />
          <span className="igdb-search__toggle-title">{t.findImagesOnline}</span>
        </span>
        <span className="igdb-search__toggle-meta">
          <span className="igdb-search__badge">{t.optional}</span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div className="igdb-search__panel">
          <p className="igdb-search__help">{t.imageSearchHelpIgdb}</p>

          <div className="igdb-search__row">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
              placeholder={t.searchGameImages}
              className="input igdb-search__input"
              enterKeyHint="search"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="btn btn-primary igdb-search__go"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{t.deepSearch}</span>
            </button>
          </div>

          {chips.length > 0 && (
            <div className="igdb-search__chips" role="group" aria-label={t.searchGameImages}>
              {chips.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setQuery(q); runSearch(q); }}
                  className="igdb-search__chip"
                  dir="auto"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {!meta.hasIgdbKey && (
            <p className="igdb-search__warn">{t.igdbKeyHint}</p>
          )}

          {meta.sourcesUsed?.length > 0 && (
            <p className="igdb-search__meta" dir="auto">
              {t.igdbSourcesLabel}: {meta.sourcesUsed.join(' · ')}
              {meta.totalFound > 0 ? ` · ${meta.totalFound}` : ''}
            </p>
          )}

          {(covers.length > 0 || logos.length > 0) && (
            <div className="igdb-search__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'covers'}
                onClick={() => setTab('covers')}
                className={`igdb-search__tab${tab === 'covers' ? ' igdb-search__tab--active' : ''}`}
              >
                {t.coversTab}
                <span className="igdb-search__tab-count" dir="ltr">{covers.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'logos'}
                onClick={() => setTab('logos')}
                className={`igdb-search__tab${tab === 'logos' ? ' igdb-search__tab--active' : ''}`}
              >
                {t.logosTab}
                <span className="igdb-search__tab-count" dir="ltr">{logos.length}</span>
              </button>
            </div>
          )}

          {error ? <p className="igdb-search__error">{error}</p> : null}

          {displayList.length > 0 && (
            <div className="igdb-search__grid">
              {displayList.map((item) => (
                <article key={`${item.url}-${item.source}-${item.title}`} className="igdb-search__card">
                  <div className="igdb-search__thumb-wrap">
                    <img
                      src={item.thumb || item.url}
                      alt=""
                      className={`igdb-search__thumb${tab === 'logos' ? ' igdb-search__thumb--contain' : ''}`}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.closest('.igdb-search__card')?.classList.add('igdb-search__card--broken'); }}
                    />
                    <span className="igdb-search__source">{item.source}</span>
                  </div>
                  <p className="igdb-search__card-title" dir="auto" title={item.title}>{item.title}</p>
                  <div className="igdb-search__actions">
                    {tab === 'covers' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectCover?.(item.url)}
                          className="igdb-search__action igdb-search__action--primary"
                        >
                          {t.useAsCover}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectLogo?.(item.url)}
                          className="igdb-search__action"
                          title={t.useAsLogo}
                        >
                          {t.useAsLogoShort}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectLogo?.(item.url)}
                        className="igdb-search__action igdb-search__action--primary igdb-search__action--full"
                      >
                        {t.useAsLogo}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && !covers.length && !logos.length && !error && (
            <p className="igdb-search__empty">{t.igdbSearchStartHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
