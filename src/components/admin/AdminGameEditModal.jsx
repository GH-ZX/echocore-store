import { useEffect, useState, useMemo, useCallback } from 'react';
import { X, Percent, Lock, RefreshCw, Loader2 } from 'lucide-react';
import { uploadImage } from '../../lib/uploadImage';
// import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';
import ImageFocusPicker from './ImageFocusPicker';
import GameImageSearch from './GameImageSearch';
import SiteImagePicker from './SiteImagePicker';
import { dedupeGameLogoAgainstCover } from '../../lib/gameImages';
import {
  applyGameOffersPricing,
  fetchStoreMarkupPercent,
} from '../../lib/adminOfferPricing';
import PricingEditableValue from './PricingEditableValue';
import { formatMessage } from '../../lib/i18n';

export default function AdminGameEditModal({
  game,
  games = [],
  offers = [],
  lang = 'en',
  t = {},
  onClose,
  onSave,
  onDelete: _onDelete,
  onOffersPricingApplied,
}) {
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
  const [deleting] = useState(false);
  /* unused: showDeleteConfirm
  const [_showDeleteConfirm, _setShowDeleteConfirm] = useState(false);
  */
  const [error, setError] = useState('');
  const [bulkMargin, setBulkMargin] = useState('');
  const [storeMarkup, setStoreMarkup] = useState(15);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');

  const isNew = !game?.id;

  const gameOffersCount = useMemo(
    () => (game?.id ? offers.filter((o) => String(o.game_id) === String(game.id)).length : 0),
    [game, offers],
  );

  useEffect(() => {
    let cancelled = false;
    fetchStoreMarkupPercent().then((m) => {
      if (!cancelled) {
        setStoreMarkup(m);
        setBulkMargin((prev) => (prev === '' ? String(m) : prev));
      }
    });
    return () => { cancelled = true; };
  }, []);

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
    setBulkMsg('');
  }, [game, isNew]);

  const runBulkPricing = useCallback(async (action) => {
    if (!game?.id) return;
    setBulkBusy(true);
    setBulkMsg('');
    setError('');
    try {
      const result = await applyGameOffersPricing(game.id, action, {
        marginPercent: action === 'margin' ? parseFloat(bulkMargin) : null,
        storeMarkupPercent: storeMarkup,
      });
      setBulkMsg(formatMessage(t.gamePricingApplied || 'Updated pricing on {count} packs.', {
        count: result.updated,
      }));
      // Push DB rows into app state (or parent re-fetches)
      await onOffersPricingApplied?.(result);
    } catch (err) {
      setError(err.message || t.gamePricingFailed || 'Could not update pack pricing.');
    } finally {
      setBulkBusy(false);
    }
  }, [game, bulkMargin, storeMarkup, t, onOffersPricingApplied]);

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

    if (isNew || !game?.id) {
      setError(t.adminGamesFromG2bulkOnly || 'Games are added only via G2Bulk catalog sync.');
      return;
    }

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
      finalLogo = dedupeGameLogoAgainstCover(finalLogo, finalImage);

      // Lock custom cover/logo so catalog sync never overwrites admin media
      const coverChanged = !!coverFile
        || String(finalImage || '') !== String(game?.image_url || '');
      const logoChanged = !!logoFile
        || String(finalLogo || '') !== String(game?.logo_url || '');

      await onSave({
        id: game?.id || null,
        show_in_carousel: game?.show_in_carousel ?? false,
        name_en: form.name_en.trim(),
        name_ar: form.name_en.trim(),
        slug: form.slug,
        points_name: form.points_name || 'Points',
        logo_url: finalLogo,
        image_url: finalImage,
        // Keep existing lock if image unchanged; set lock when admin changes media
        image_custom: coverChanged ? !!finalImage : (game?.image_custom || !!finalImage),
        logo_custom: logoChanged ? !!finalLogo : (game?.logo_custom || !!finalLogo),
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

  /*
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
  */

  return (
    <Modal open={!!game} onClose={onClose} size="xl" zIndex={100} ariaLabelledBy="admin-game-edit-title">
        <div className="modal-panel__header">
          <h2 id="admin-game-edit-title" className="text-lg font-bold">
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
            <SiteImagePicker
              t={t}
              games={games}
              offers={offers}
              g2bulkGameCode={form.g2bulk_game_code}
              fieldLabel={t.siteImagePickerLogo}
              onSelect={(url) => {
                setLogoFile(null);
                setForm((prev) => ({ ...prev, logo_url: url }));
              }}
            />
            <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="input text-sm mt-2" />
            <input
              placeholder={t.orPasteLogoURL || 'Or logo URL'}
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="input mt-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.coverPhoto || 'Cover photo'}</label>
            <SiteImagePicker
              t={t}
              games={games}
              offers={offers}
              g2bulkGameCode={form.g2bulk_game_code}
              fieldLabel={t.siteImagePickerCover}
              onSelect={(url) => {
                setCoverFile(null);
                setForm((prev) => ({
                  ...prev,
                  image_url: url,
                  carousel_focus_x: 50,
                  carousel_focus_y: 50,
                }));
              }}
            />
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

          {!isNew && gameOffersCount > 0 && (
            <div className="rounded-xl border border-[var(--border)] p-3 space-y-3 bg-[var(--bg-primary)]/40">
              <div className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide">
                {t.gamePricingTitle || 'All packs pricing'}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                {formatMessage(
                  t.gamePricingHelp || 'Apply pricing to all {count} packs under this game (top-up & redeem). Sale packs are skipped.',
                  { count: gameOffersCount },
                )}
              </p>

              <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-3 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)]">
                  {t.pricingCurrentSelection || 'Current selection'}
                </div>
                <div className="text-sm text-[var(--text-sec)]">
                  {formatMessage(t.gamePricingStoreDefault || 'Store default markup: {markup}%', {
                    markup: storeMarkup,
                  })}
                </div>
                <PricingEditableValue
                  label={t.pricingCustomMargin || 'Margin %'}
                  value={bulkMargin}
                  displayValue={
                    bulkMargin === '' || bulkMargin == null ? '— %' : `${bulkMargin}%`
                  }
                  suffix="%"
                  min={0}
                  max={500}
                  step={0.5}
                  t={t}
                  onCommit={(v) => setBulkMargin(v)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => runBulkPricing('margin')}
                  className="btn btn-secondary text-sm inline-flex items-center gap-1.5"
                >
                  {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Percent className="w-3.5 h-3.5" />}
                  {t.gamePricingApplyMargin || 'Apply margin to all'}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => runBulkPricing('fixed_current')}
                  className="btn btn-secondary text-sm inline-flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  {t.gamePricingLockAll || 'Lock current prices'}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => runBulkPricing('auto')}
                  className="btn btn-secondary text-sm inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {formatMessage(t.gamePricingResetAuto || 'Reset to store {markup}%', {
                    markup: storeMarkup,
                  })}
                </button>
              </div>
              {bulkMsg && (
                <p className="text-xs text-green-400">{bulkMsg}</p>
              )}
            </div>
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
          </div>
        </form>
    </Modal>
  );
}