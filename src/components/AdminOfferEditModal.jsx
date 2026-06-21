import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { uploadImage } from '../lib/uploadImage';

export default function AdminOfferEditModal({ offer, games = [], lang = 'en', t = {}, onClose, onSave }) {
  const [form, setForm] = useState({
    game_id: '',
    name_en: '',
    name_ar: '',
    price: '',
    region: '',
    description_en: '',
    sale_image_url: '',
    is_sale: false,
    original_price: '',
  });
  const [saleCoverFile, setSaleCoverFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!offer) return;
    setForm({
      game_id: offer.game_id || '',
      name_en: offer.name_en || '',
      name_ar: offer.name_ar || '',
      price: offer.price ?? '',
      region: offer.region || '',
      description_en: offer.description_en || offer.description_ar || '',
      sale_image_url: offer.sale_image_url || '',
      is_sale: !!offer.is_sale,
      original_price: offer.original_price || '',
    });
    setSaleCoverFile(null);
    setError('');
  }, [offer]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name_en || !form.price || !form.game_id) {
      setError(t.gameNameEnglishAndPriceRequired || 'Name, price, and game are required.');
      return;
    }
    if (form.is_sale && !form.original_price) {
      setError(t.originalPriceRequiredForSale || 'Original price is required for sale offers.');
      return;
    }

    setSaving(true);
    try {
      let finalSaleImage = form.sale_image_url || null;
      if (saleCoverFile) {
        finalSaleImage = await uploadImage(saleCoverFile, 'sale');
      }

      const desc = (form.description_en || '').trim();
      await onSave({
        id: offer.id,
        game_id: form.game_id,
        name_en: form.name_en.trim(),
        name_ar: (form.name_ar || form.name_en).trim(),
        price: form.price,
        region: form.region || null,
        description_en: desc,
        description_ar: desc,
        sale_image_url: finalSaleImage,
        is_sale: !!form.is_sale,
        original_price: form.is_sale ? (parseFloat(form.original_price) || null) : null,
      });
      onClose();
    } catch (err) {
      setError(err.message || t.failedToSaveOffer || 'Failed to save offer.');
    } finally {
      setSaving(false);
    }
  };

  if (!offer) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
          <h2 className="text-lg font-bold">{t.editOffer || 'Edit Offer'}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder={t.nameEnglish || 'Name (English)'}
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              className="input"
            />
            <input
              placeholder={t.nameArabicOptional || 'Name (Arabic, optional)'}
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              className="input"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.selectGame || 'Game'}</label>
            <select
              required
              value={form.game_id}
              onChange={(e) => setForm({ ...form, game_id: e.target.value })}
              className="input w-full"
            >
              <option value="">{t.selectGame || 'Select game'}</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {lang === 'ar' ? g.name_ar : g.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="number"
              step="0.01"
              placeholder={t.price || 'Price'}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="input"
            />
            <input
              placeholder={t.regionOptional || 'Region (optional)'}
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className="input"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
            <input
              type="checkbox"
              checked={!!form.is_sale}
              onChange={(e) => setForm({
                ...form,
                is_sale: e.target.checked,
                original_price: e.target.checked ? form.original_price : '',
              })}
              className="accent-[var(--accent)]"
            />
            {t.thisIsSaleOffer || 'This is a sale offer'}
          </label>

          {form.is_sale && (
            <input
              required
              type="number"
              step="0.01"
              placeholder={t.originalPriceBeforeDiscount || 'Original price'}
              value={form.original_price}
              onChange={(e) => setForm({ ...form, original_price: e.target.value })}
              className="input"
            />
          )}

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.description || 'Description'}</label>
            <textarea
              placeholder={t.descriptionOneEnough || 'Description'}
              value={form.description_en}
              onChange={(e) => setForm({ ...form, description_en: e.target.value })}
              className="input w-full h-24 resize-y"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.salePhotoOptional || 'Sale photo (optional)'}</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSaleCoverFile(e.target.files?.[0] || null)}
              className="input text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[var(--accent)] file:text-[#040812]"
            />
            <input
              placeholder={t.orPasteSalePhotoURL || 'Or paste image URL'}
              value={form.sale_image_url}
              onChange={(e) => setForm({ ...form, sale_image_url: e.target.value })}
              className="input mt-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded border border-red-500/60 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn btn-primary flex-1 py-3 disabled:opacity-60">
              {saving ? (t.uploading || 'Saving...') : (t.updateOffer || 'Update Offer')}
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