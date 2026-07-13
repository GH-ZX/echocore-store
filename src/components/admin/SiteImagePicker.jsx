import { useCallback, useEffect, useMemo, useState } from 'react';
import { Images, Loader2 } from 'lucide-react';
import { listG2bulkPullCatalog } from '../../lib/g2bulk';
import { collectG2bulkCatalogImages, collectSiteImages } from '../../lib/siteImageLibrary';

export default function SiteImagePicker({
  t = {},
  games = [],
  offers = [],
  g2bulkGameCode = '',
  g2bulkCategoryId = null,
  onSelect,
  fieldLabel = '',
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('site');
  const [g2bulkLoading, setG2bulkLoading] = useState(false);
  const [g2bulkCatalog, setG2bulkCatalog] = useState(null);
  const [g2bulkError, setG2bulkError] = useState('');

  const siteImages = useMemo(
    () => collectSiteImages({ games, offers }),
    [games, offers],
  );

  const g2bulkImages = useMemo(() => {
    if (!g2bulkCatalog) return [];
    return collectG2bulkCatalogImages(g2bulkCatalog, {
      gameCode: g2bulkGameCode,
      categoryId: g2bulkCategoryId,
      includeAll: !g2bulkGameCode && !Number.isFinite(Number(g2bulkCategoryId)),
    });
  }, [g2bulkCatalog, g2bulkGameCode, g2bulkCategoryId]);

  const loadG2bulkImages = useCallback(async () => {
    setG2bulkLoading(true);
    setG2bulkError('');
    try {
      const catalog = await listG2bulkPullCatalog();
      setG2bulkCatalog(catalog);
    } catch (err) {
      setG2bulkError(err.message || t.siteImagePickerLoadFailed);
      setG2bulkCatalog(null);
    } finally {
      setG2bulkLoading(false);
    }
  }, [t.siteImagePickerLoadFailed]);

  useEffect(() => {
    if (!open || tab !== 'g2bulk' || g2bulkCatalog || g2bulkLoading) return;
    loadG2bulkImages();
  }, [open, tab, g2bulkCatalog, g2bulkLoading, loadG2bulkImages]);

  const activeList = tab === 'site' ? siteImages : g2bulkImages;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Images className="w-4 h-4" />
          {fieldLabel || t.siteImagePickerTitle}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] font-normal">
          {t.optional}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--text-muted)] pt-2 leading-relaxed">
            {t.siteImagePickerHelp}
          </p>

          <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setTab('site')}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
                tab === 'site'
                  ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {t.siteImagesTab} ({siteImages.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('g2bulk')}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
                tab === 'g2bulk'
                  ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {t.g2bulkImagesTab}
            </button>
          </div>

          {tab === 'g2bulk' && g2bulkLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--text-sec)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.siteImagePickerLoading}
            </div>
          )}

          {tab === 'g2bulk' && g2bulkError && (
            <p className="text-xs text-red-400">{g2bulkError}</p>
          )}

          {tab === 'g2bulk' && !g2bulkLoading && !g2bulkError && (
            <button
              type="button"
              onClick={loadG2bulkImages}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              {t.siteImagePickerRefreshG2bulk}
            </button>
          )}

          {!g2bulkLoading && activeList.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[280px] overflow-y-auto pr-0.5">
              {activeList.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => onSelect?.(item.url)}
                  className="group rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--bg-surface)] hover:border-[var(--accent)]/50 transition-colors text-left"
                  title={item.label}
                >
                  <div className="h-16 sm:h-20 bg-black/30">
                    <img
                      src={item.url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
                    />
                  </div>
                  <div className="p-1.5">
                    <p className="text-[9px] text-[var(--text-muted)] truncate">{item.label}</p>
                    <p className="text-[9px] font-bold text-[var(--accent)] mt-0.5">
                      {t.useThisImage}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!g2bulkLoading && activeList.length === 0 && (
            <p className="text-xs text-center text-[var(--text-muted)] py-4">
              {tab === 'site' ? t.siteImagePickerEmptySite : t.siteImagePickerEmptyG2bulk}
            </p>
          )}
        </div>
      )}
    </div>
  );
}