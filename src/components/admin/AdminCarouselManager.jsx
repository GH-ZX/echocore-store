import { useEffect, useState } from 'react';
import { X, ChevronUp, ChevronDown, Eye, EyeOff, Plus, GripVertical, ExternalLink } from 'lucide-react';
import AdminEditButton from './AdminEditButton';
import Modal from '../ui/Modal';
import { resolveCarouselLogo } from '../../lib/carouselUtils';

export default function AdminCarouselManager({
  games = [],
  catalogGames = games,
  lang = 'en',
  t = {},
  onClose,
  onSave,
  onEditGame,
  onGoToAddGames,
}) {
  const [carouselList, setCarouselList] = useState([]);
  const [hiddenList, setHiddenList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const sorted = [...games].sort((a, b) => {
      const ao = a.carousel_order ?? 999999;
      const bo = b.carousel_order ?? 999999;
      if (ao !== bo) return ao - bo;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    const visible = sorted.filter((g) => g.show_in_carousel !== false);
    const hidden = sorted.filter((g) => g.show_in_carousel === false);
    setCarouselList(visible);
    setHiddenList(hidden);
    setError('');
  }, [games]);

  const moveItem = (index, direction) => {
    const next = index + direction;
    if (next < 0 || next >= carouselList.length) return;
    setCarouselList((prev) => {
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };

  const removeFromCarousel = (game) => {
    setCarouselList((prev) => prev.filter((g) => g.id !== game.id));
    setHiddenList((prev) => [...prev, game]);
  };

  const addToCarousel = (game) => {
    setHiddenList((prev) => prev.filter((g) => g.id !== game.id));
    setCarouselList((prev) => [...prev, game]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = [
        ...carouselList.map((g, index) => ({
          id: g.id,
          carousel_order: index,
          show_in_carousel: true,
        })),
        ...hiddenList.map((g, index) => ({
          id: g.id,
          carousel_order: carouselList.length + index,
          show_in_carousel: false,
        })),
      ];
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save carousel order.');
    } finally {
      setSaving(false);
    }
  };

  const gameName = (g) => (lang === 'ar' ? g.name_ar : g.name_en) || g.name_en;

  const renderRow = (game, index, { inCarousel }) => {
    const thumbSrc = resolveCarouselLogo(game, catalogGames);
    return (
    <div
      key={game.id}
      className="flex items-center gap-2 sm:gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]"
    >
      <GripVertical className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 hidden sm:block" />
      {thumbSrc ? (
        <img src={thumbSrc} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded bg-[var(--bg-elevated)] flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{gameName(game)}</div>
        <div className="text-[10px] text-[var(--text-muted)] truncate">
          {(lang === 'ar' ? game.description_ar : game.description_en) || t.noDescription || 'No carousel description'}
        </div>
      </div>

      {inCarousel ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => moveItem(index, -1)}
            disabled={index === 0}
            className="p-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/50 disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => moveItem(index, 1)}
            disabled={index === carouselList.length - 1}
            className="p-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/50 disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <AdminEditButton
            iconOnly
            label={t.edit || 'Edit'}
            onClick={() => onEditGame?.(game)}
          />
          <button
            type="button"
            onClick={() => removeFromCarousel(game)}
            className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/40"
            title={t.hideFromCarousel || 'Hide from carousel'}
          >
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => addToCarousel(game)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)]/10 flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          {t.addToCarousel || 'Add'}
        </button>
      )}
    </div>
    );
  };

  return (
    <Modal open onClose={onClose} size="xl" zIndex={100} ariaLabelledBy="admin-carousel-title">
        <div className="modal-panel__header">
          <div>
            <h2 id="admin-carousel-title" className="text-lg font-bold">{t.manageCarousel || 'Manage Carousel'}</h2>
            <p className="text-xs text-[var(--text-muted)]">
              {t.carouselOrderHelp || 'Reorder slides from games already in your store'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-[var(--accent)]">
              <Eye className="w-4 h-4" />
              {t.carouselSlides || 'Carousel slides'} ({carouselList.length})
            </div>
            <div className="space-y-2">
              {carouselList.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] py-4 text-center">
                  {t.noCarouselSlides || 'No games in carousel. Add from your store games below.'}
                </p>
              ) : (
                carouselList.map((game, index) => renderRow(game, index, { inCarousel: true }))
              )}
            </div>
          </div>

          {hiddenList.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-[var(--text-muted)]">
                <EyeOff className="w-4 h-4" />
                {t.hiddenFromCarousel || 'Hidden from carousel'} ({hiddenList.length})
              </div>
              <div className="space-y-2">
                {hiddenList.map((game, index) => renderRow(game, index, { inCarousel: false }))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded border border-red-500/60 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>
          )}

          <div className="space-y-2 pt-1">
            {onGoToAddGames && (
              <button
                type="button"
                onClick={onGoToAddGames}
                className="btn btn-secondary w-full inline-flex items-center justify-center gap-2 min-h-[44px]"
              >
                <ExternalLink className="w-4 h-4" />
                {t.goToAddGames || (lang === 'ar' ? 'إضافة ألعاب جديدة من G2Bulk' : 'Add new games from G2Bulk')}
              </button>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 py-3 disabled:opacity-60">
                {saving ? (t.saving || 'Saving...') : (t.saveCarouselOrder || 'Save Carousel')}
              </button>
              <button type="button" onClick={onClose} className="btn btn-secondary px-5">
                {t.cancel || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
    </Modal>
  );
}