import { useEffect, useState, useMemo } from 'react';
import { Trash2, X } from 'lucide-react';
import { uploadImage } from '../../lib/uploadImage';
import ConfirmDialog from '../ui/ConfirmDialog';
import ImageFocusPicker from './ImageFocusPicker';
import GameImageSearch from './GameImageSearch';

export default function AdminGameEditModal({ game, lang = 'en', t = {}, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    name_en: '',
    slug: '',
    points_name: '',
    logo_url: '',
    image_url: '',
    redemption_method: 'both',
    description_en: '',
    description_ar: '',
    carousel_focus_x: 50,
    carousel_focus_y: 50,
    g2bulk_game_code: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');

  const isNew = !game?.id;

  useEffect(() => {
    if (!game) return;

    if (isNew) {
      setForm({
        name_en: '',
        slug: '',
        points_name: '',
        logo_url: '',
        image_url: '',
        redemption_method: 'both',
        description_en: '',
        description_ar: '',
        carousel_focus_x: 50,
        carousel_focus_y: 50,
        g2bulk_game_code: '',
      });
    } else {
      setForm({
        name_en: game.name_en || '',
        slug: game.slug || '',
        points_name: game.points_name || '',
        logo_url: game.logo_url || '',
        image_url: game.image_url || '',
        redemption_method: game.redemption_method || 'both',
        description_en: game.description_en || '',
        description_ar: game.description_ar || '',
        carousel_focus_x: game.carousel_focus_x ?? 50,
        carousel_focus_y: game.carousel_focus_y ?? 50,
        g2bulk_game_code: game.g2bulk_game_code || '',
      });
    }

    setLogoFile(null);
    setCoverFile(null);
    setError('');
  }, [game, isNew]);

  useEffect(() => {
    if (coverFile) {
      const url = URL.createObjectURL(coverFile);
      setCoverPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setCoverPreviewUrl(form.image_url || null);
  }, [coverFile, form.image_url]);

  const coverImageForFocus = useMemo(() => coverPreviewUrl, [coverPreviewUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name_en || !form.slug) {
      setError(t.gameNameAndSlugRequired || 'Game name and slug are required.');
      return;
    }

    setSaving(true);
    try {
      let finalLogo = form.logo_url || null;
      let finalImage = form.image_url || null;

      if (logoFile) finalLogo = await uploadImage(logoFile, 'game-logo');
      if (coverFile) finalImage = await uploadImage(coverFile, 'game-cover');

      await onSave({
        id: game?.id || null,
        show_in_carousel: game?.show_in_carousel ?? false,
        name_en: form.name_en.trim(),
        name_ar: form.name_en.trim(),
        slug: form.slug,
        points_name: form.points_name || 'Points',
        logo_url: finalLogo,
        image_url: finalImage,
        redemption_method: form.redemption_method || 'both',
        description_en: form.description_en || '',
        description_ar: form.description_ar || form.description_en || '',
        carousel_focus_x: form.carousel_focus_x ?? 50,
        carousel_focus_y: form.carousel_focus_y ?? 50,
        g2bulk_game_code: form.g2bulk_game_code?.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err.message || t.failedToSaveGame || 'Failed to save game.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!game?.id || !onDelete) return;
    setError('');
    setDeleting(true);
    try {
      await onDelete(game.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err) {
      setError(err.message || t.failedToDeleteGame || 'Failed to delete game.');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!game) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
          <h2 className="text-lg font-bold">
            {isNew ? (t.addGame || 'Add Game') : (t.editGame || 'Edit Game')}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <input
            required
            placeholder={t.gameNameEnglish || 'Game name (English)'}
            value={form.name_en}
            onChange={(e) => setForm({ ...form, name_en: e.target.value })}
            className="input"
          />
          <input
            required
            placeholder={t.slug || 'Slug'}
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="input"
          />
          <input
            placeholder={t.pointsName || 'Points name (VP, RP, UC...)'}
            value={form.points_name}
            onChange={(e) => setForm({ ...form, points_name: e.target.value })}
            className="input"
          />

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">
              {t.descriptionEnglish || 'Carousel description (English)'}
            </label>
            <textarea
              placeholder={t.descriptionEnglish || 'Text shown on the carousel slide'}
              value={form.description_en}
              onChange={(e) => setForm({ ...form, description_en: e.target.value })}
              className="input w-full h-20 resize-y"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">
              {t.descriptionArabic || 'Carousel description (Arabic)'}
            </label>
            <textarea
              placeholder={t.descriptionArabic || 'Arabic carousel text'}
              value={form.description_ar}
              onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
              className="input w-full h-20 resize-y"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.redemptionMethod || 'Redemption method'}</label>
            <select
              value={form.redemption_method}
              onChange={(e) => setForm({ ...form, redemption_method: e.target.value })}
              className="input w-full"
            >
              <option value="uid">{t.redemptionUid || 'UID only'}</option>
              <option value="redeem_code">{t.redemptionCode || 'Redeem code only'}</option>
              <option value="both">{t.redemptionBoth || 'Both'}</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">
              {t.g2bulkGameCode || 'Catalog game code'}
            </label>
            <input
              placeholder="pubgm, mlbb, free_fire…"
              value={form.g2bulk_game_code}
              onChange={(e) => setForm({ ...form, g2bulk_game_code: e.target.value })}
              className="input w-full font-mono text-sm"
            />
          </div>

          <GameImageSearch
            gameName={form.name_en}
            t={t}
            lang={lang}
            onSelectCover={(url) => {
              setCoverFile(null);
              setForm((prev) => ({
                ...prev,
                image_url: url,
                carousel_focus_x: 50,
                carousel_focus_y: 50,
              }));
            }}
            onSelectLogo={(url) => {
              setLogoFile(null);
              setForm((prev) => ({ ...prev, logo_url: url }));
            }}
          />

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.logoForCarousel || 'Logo'}</label>
            <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="input text-sm" />
            <input
              placeholder={t.orPasteLogoURL || 'Or logo URL'}
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="input mt-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.coverPhoto || 'Cover photo'}</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setCoverFile(file);
                if (file) {
                  setForm((prev) => ({ ...prev, carousel_focus_x: 50, carousel_focus_y: 50 }));
                }
              }}
              className="input text-sm"
            />
            <input
              placeholder={t.orPasteCoverURL || 'Or cover URL'}
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className="input mt-2 text-sm"
            />
          </div>

          {coverImageForFocus && (
            <ImageFocusPicker
              imageSrc={coverImageForFocus}
              focusX={form.carousel_focus_x}
              focusY={form.carousel_focus_y}
              onChange={({ x, y }) => setForm((prev) => ({ ...prev, carousel_focus_x: x, carousel_focus_y: y }))}
              t={t}
              lang={lang}
            />
          )}

          {error && (
            <div className="rounded border border-red-500/60 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-2">
              <button type="submit" disabled={saving || deleting} className="btn btn-primary flex-1 py-3 disabled:opacity-60">
                {saving ? (t.uploading || 'Saving...') : (isNew ? (t.addGame || 'Add Game') : (t.updateGameBtn || 'Update Game'))}
              </button>
              <button type="button" onClick={onClose} disabled={saving || deleting} className="btn btn-secondary px-5 disabled:opacity-60">
                {t.cancel || 'Cancel'}
              </button>
            </div>
            {!isNew && onDelete && (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => setShowDeleteConfirm(true)}
                className="btn w-full py-2.5 text-red-400 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {t.deleteGame || t.delete || 'Delete Game'}
              </button>
            )}
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={t.deleteGame || t.delete || 'Delete Game'}
        message={t.deleteGameConfirm || 'Delete this game? This will also delete all its offers.'}
        confirmLabel={t.confirm || t.delete || 'Confirm'}
        cancelLabel={t.cancel || 'Cancel'}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}