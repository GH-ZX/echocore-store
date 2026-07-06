import { useEffect, useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { uploadImage } from '../lib/uploadImage';
import ImageFocusPicker from './ImageFocusPicker';
import GameImageSearch from './GameImageSearch';

const DEFAULT_SERVERS = [
  'Global', 'Europe', 'Turkey', 'Korea', 'North America', 'Southeast Asia',
  'Latin America', 'Middle East', 'Japan', 'India', 'Russia', 'China', 'Oceania', 'Brazil',
];

export default function AdminGameEditModal({ game, lang = 'en', t = {}, onClose, onSave }) {
  const [form, setForm] = useState({
    name_en: '',
    slug: '',
    points_name: '',
    logo_url: '',
    image_url: '',
    redemption_method: 'both',
    servers: [],
    description_en: '',
    description_ar: '',
    carousel_focus_x: 50,
    carousel_focus_y: 50,
  });
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const serverList = (t.serverOptions && t.serverOptions.length > 0) ? t.serverOptions : DEFAULT_SERVERS;

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
        servers: [],
        description_en: '',
        description_ar: '',
        carousel_focus_x: 50,
        carousel_focus_y: 50,
      });
    } else {
      setForm({
        name_en: game.name_en || '',
        slug: game.slug || '',
        points_name: game.points_name || '',
        logo_url: game.logo_url || '',
        image_url: game.image_url || '',
        redemption_method: game.redemption_method || 'both',
        servers: Array.isArray(game.servers) ? game.servers : [],
        description_en: game.description_en || '',
        description_ar: game.description_ar || '',
        carousel_focus_x: game.carousel_focus_x ?? 50,
        carousel_focus_y: game.carousel_focus_y ?? 50,
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

  const toggleServer = (srv) => {
    setForm((prev) => {
      const current = Array.isArray(prev.servers) ? prev.servers : [];
      const isSelected = current.includes(srv);
      return {
        ...prev,
        servers: isSelected ? current.filter((s) => s !== srv) : [...current, srv],
      };
    });
  };

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
        servers: Array.isArray(form.servers) ? form.servers : [],
        description_en: form.description_en || '',
        description_ar: form.description_ar || form.description_en || '',
        carousel_focus_x: form.carousel_focus_x ?? 50,
        carousel_focus_y: form.carousel_focus_y ?? 50,
      });
      onClose();
    } catch (err) {
      setError(err.message || t.failedToSaveGame || 'Failed to save game.');
    } finally {
      setSaving(false);
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
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block">{t.availableServers || 'Servers'}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {serverList.map((srv) => {
                const isSelected = form.servers.includes(srv);
                return (
                  <button
                    key={srv}
                    type="button"
                    onClick={() => toggleServer(srv)}
                    className={`rounded-xl border px-2 py-2 text-xs text-left transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[#040812]'
                        : 'border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent)]/50'
                    }`}
                  >
                    {srv}
                  </button>
                );
              })}
            </div>
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

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn btn-primary flex-1 py-3 disabled:opacity-60">
              {saving ? (t.uploading || 'Saving...') : (isNew ? (t.addGame || 'Add Game') : (t.updateGameBtn || 'Update Game'))}
            </button>
            <button type="button" onClick={onClose} className="btn btn-secondary px-5">
              {t.cancel || 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}