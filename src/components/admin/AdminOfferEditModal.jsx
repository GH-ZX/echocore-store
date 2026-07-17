import { useEffect, useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { uploadImage } from '../../lib/uploadImage';
import Modal from '../ui/Modal';
import SiteImagePicker from './SiteImagePicker';
import PricingEditableValue from './PricingEditableValue';
import { getVoucherCategoryId } from '../../lib/pullCatalogUtils';
import {
  fetchStoreMarkupPercent,
  priceFromCost,
  normalizePricingMode,
  persistOfferPricing,
} from '../../lib/adminOfferPricing';
import { formatMessage } from '../../lib/i18n';
import { pricingModeLabel } from '../../lib/offerPricing';

export default function AdminOfferEditModal({
  offer,
  games = [],
  offers = [],
  lang = 'en',
  t = {},
  onClose,
  onSave,
  onPricingSaved,
}) {
  const [form, setForm] = useState({
    game_id: '',
    name_en: '',
    name_ar: '',
    price: '',
    pricing_mode: 'auto',
    pricing_margin_percent: '',
    description_en: '',
    sale_image_url: '',
    is_sale: false,
    original_price: '',
    g2bulk_type: '',
    g2bulk_catalogue_name: '',
    g2bulk_product_id: '',
    g2bulk_cost_usd: '',
  });
  const [storeMarkup, setStoreMarkup] = useState(15);
  const [saleCoverFile, setSaleCoverFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [error, setError] = useState('');
  const [pricingOk, setPricingOk] = useState('');
  /** Unlock mode / margin / price fields only after pencil */
  const [pricingEditing, setPricingEditing] = useState(false);

  const isNew = !offer?.id;
  const selectedGame = games.find((g) => String(g.id) === String(form.game_id));
  const g2bulkCategoryId = selectedGame ? getVoucherCategoryId(selectedGame) : null;
  const cost = Number(form.g2bulk_cost_usd);
  const mode = normalizePricingMode(form.pricing_mode);

  const previewPrice = useMemo(() => {
    if (!Number.isFinite(cost) || cost <= 0) return null;
    if (mode === 'fixed') {
      const p = parseFloat(form.price);
      return Number.isFinite(p) ? p : null;
    }
    if (mode === 'margin') {
      const m = parseFloat(form.pricing_margin_percent);
      if (!Number.isFinite(m)) return null;
      return priceFromCost(cost, m);
    }
    return priceFromCost(cost, storeMarkup);
  }, [cost, mode, form.price, form.pricing_margin_percent, storeMarkup]);

  useEffect(() => {
    let cancelled = false;
    fetchStoreMarkupPercent().then((m) => {
      if (!cancelled) setStoreMarkup(m);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!offer) return;

    if (isNew) {
      setForm({
        game_id: offer.game_id || '',
        name_en: '',
        name_ar: '',
        price: '',
        pricing_mode: 'auto',
        pricing_margin_percent: '',
        description_en: '',
        sale_image_url: '',
        is_sale: !!offer.is_sale,
        original_price: '',
        g2bulk_type: '',
        g2bulk_catalogue_name: '',
        g2bulk_product_id: '',
        g2bulk_cost_usd: '',
      });
    } else {
      setForm({
        game_id: offer.game_id || '',
        name_en: offer.name_en || '',
        name_ar: offer.name_ar || '',
        price: offer.price ?? '',
        pricing_mode: normalizePricingMode(offer.pricing_mode),
        pricing_margin_percent: offer.pricing_margin_percent ?? '',
        description_en: offer.description_en || offer.description_ar || '',
        sale_image_url: offer.sale_image_url || '',
        is_sale: !!offer.is_sale,
        original_price: offer.original_price || '',
        g2bulk_type: offer.g2bulk_type || '',
        g2bulk_catalogue_name: offer.g2bulk_catalogue_name || '',
        g2bulk_product_id: offer.g2bulk_product_id ?? '',
        g2bulk_cost_usd: offer.g2bulk_cost_usd ?? '',
      });
    }

    setSaleCoverFile(null);
    setError('');
    setPricingOk('');
    setPricingEditing(false);
  }, [offer, isNew]);

  /** Write pricing_mode / margin / price to Supabase for this pack (top-up or redeem). */
  const savePricingToDatabase = async () => {
    setError('');
    setPricingOk('');

    if (mode === 'margin') {
      const m = parseFloat(form.pricing_margin_percent);
      if (!Number.isFinite(m) || m < 0) {
        setError(t.pricingMarginRequired || 'Enter a margin percent for this pack.');
        return false;
      }
    }
    if (form.price === '' || form.price == null || !Number.isFinite(parseFloat(form.price))) {
      setError(t.gameNameEnglishAndPriceRequired || 'Price is required.');
      return false;
    }

    // New offer: keep local only until full form save
    if (!offer?.id) {
      setPricingEditing(false);
      setPricingOk(t.pricingLocalUntilSave || 'Pricing will be saved with the offer.');
      return true;
    }

    setPricingSaving(true);
    try {
      const finalMode = form.is_sale ? 'fixed' : mode;
      const saved = await persistOfferPricing(offer.id, {
        pricing_mode: finalMode,
        pricing_margin_percent: form.pricing_margin_percent,
        price: form.price,
        is_sale: form.is_sale,
      });
      setForm((prev) => ({
        ...prev,
        pricing_mode: normalizePricingMode(saved.pricing_mode),
        pricing_margin_percent: saved.pricing_margin_percent ?? '',
        price: saved.price ?? prev.price,
      }));
      onPricingSaved?.(saved);
      setPricingOk(t.pricingSavedToDb || 'Pricing saved to database.');
      setPricingEditing(false);
      return true;
    } catch (err) {
      setError(err.message || t.pricingSaveFailed || 'Could not save pricing to database.');
      return false;
    } finally {
      setPricingSaving(false);
    }
  };

  // Keep price in sync when mode/cost/margin/store markup changes
  useEffect(() => {
    if (!Number.isFinite(cost) || cost <= 0) return;
    if (mode === 'fixed') return;
    if (mode === 'margin') {
      const m = parseFloat(form.pricing_margin_percent);
      if (!Number.isFinite(m)) return;
      const next = priceFromCost(cost, m);
      setForm((prev) => (String(prev.price) === String(next) ? prev : { ...prev, price: next }));
      return;
    }
    const next = priceFromCost(cost, storeMarkup);
    setForm((prev) => (String(prev.price) === String(next) ? prev : { ...prev, price: next }));
  }, [mode, cost, form.pricing_margin_percent, storeMarkup]);

  const setMode = (nextMode) => {
    const m = normalizePricingMode(nextMode);
    setForm((prev) => {
      const next = { ...prev, pricing_mode: m };
      if (m === 'margin' && (prev.pricing_margin_percent === '' || prev.pricing_margin_percent == null)) {
        next.pricing_margin_percent = storeMarkup;
      }
      if (m !== 'margin') {
        // keep margin field for convenience when switching back
      }
      return next;
    });
  };

  const handlePriceEdit = (value) => {
    setForm((prev) => ({
      ...prev,
      price: value,
      // Manual price edit → lock on next sync
      pricing_mode: prev.pricing_mode === 'fixed' ? 'fixed' : 'fixed',
    }));
  };

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
    if (mode === 'margin') {
      const m = parseFloat(form.pricing_margin_percent);
      if (!Number.isFinite(m) || m < 0) {
        setError(t.pricingMarginRequired || 'Enter a margin percent for this pack.');
        return;
      }
    }

    setSaving(true);
    try {
      let finalSaleImage = form.sale_image_url || null;
      if (saleCoverFile) {
        finalSaleImage = await uploadImage(saleCoverFile, 'sale');
      }

      // Sale packs keep sale lock semantics; also mark fixed so sync never overwrites
      const finalMode = form.is_sale ? 'fixed' : mode;

      const desc = (form.description_en || '').trim();
      const saved = await onSave({
        id: offer?.id || null,
        game_id: form.game_id,
        name_en: form.name_en.trim(),
        name_ar: (form.name_ar || form.name_en).trim(),
        price: form.price,
        pricing_mode: finalMode,
        pricing_margin_percent: finalMode === 'margin'
          ? parseFloat(form.pricing_margin_percent)
          : null,
        description_en: desc,
        description_ar: desc,
        sale_image_url: finalSaleImage,
        is_sale: !!form.is_sale,
        original_price: form.is_sale ? (parseFloat(form.original_price) || null) : null,
        g2bulk_type: form.g2bulk_type || null,
        g2bulk_catalogue_name: form.g2bulk_catalogue_name?.trim() || null,
        g2bulk_product_id: form.g2bulk_product_id ? parseInt(form.g2bulk_product_id, 10) : null,
        g2bulk_cost_usd: form.g2bulk_cost_usd ? parseFloat(form.g2bulk_cost_usd) : null,
      });
      if (saved?.id) onPricingSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message || t.failedToSaveOffer || 'Failed to save offer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!offer} onClose={onClose} size="lg" zIndex={100} ariaLabelledBy="admin-offer-edit-title">
        <div className="modal-panel__header">
          <h2 id="admin-offer-edit-title" className="text-lg font-bold">
            {isNew
              ? (form.is_sale ? (t.addSaleOffer || 'Add Sale Offer') : (t.addOffer || 'Add Offer'))
              : (t.editOffer || 'Edit Offer')}
          </h2>
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

          {/* Pricing policy — values visible; edit only after pencil */}
          <div className="rounded-xl border border-[var(--border)] p-3 space-y-3 bg-[var(--bg-primary)]/40">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide">
                  {t.pricingPolicyTitle || 'Pricing'}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-1">
                  {t.pricingPolicyHelp || 'On G2Bulk sync: auto/margin recalculate from supplier cost; fixed keeps this pack price.'}
                </p>
              </div>
              {!pricingEditing && (
                <button
                  type="button"
                  onClick={() => setPricingEditing(true)}
                  className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--accent)] hover:bg-[var(--accent)]/10 touch-manipulation"
                  aria-label={t.pricingEdit || t.edit || 'Edit'}
                  title={t.pricingEdit || t.edit || 'Edit'}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Always-visible current selection */}
            <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-3 py-3 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)]">
                {t.pricingCurrentSelection || 'Current selection'}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] font-semibold text-xs">
                  {pricingModeLabel(mode, t)}
                </span>
                <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]" dir="ltr">
                  {mode === 'fixed'
                    ? `$${Number(form.price || 0).toFixed(2)}`
                    : mode === 'margin'
                      ? `${form.pricing_margin_percent ?? '—'}%`
                      : `${storeMarkup}%`}
                </span>
                {(mode === 'auto' || mode === 'margin') && form.price !== '' && form.price != null && (
                  <span className="text-xs text-[var(--text-muted)] font-mono" dir="ltr">
                    → ${Number(form.price).toFixed(2)}
                  </span>
                )}
              </div>
              {!pricingEditing && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t.pricingEditHint || 'Press the pencil to change mode, margin, or price.'}
                </p>
              )}
              {pricingOk && (
                <p className="text-[11px] text-green-400 font-medium">{pricingOk}</p>
              )}
            </div>

            {pricingEditing && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'auto', label: t.pricingModeAuto || 'Store default' },
                    { id: 'margin', label: t.pricingModeMargin || 'Custom margin' },
                    { id: 'fixed', label: t.pricingModeFixed || 'Fixed price' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMode(opt.id)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                        mode === opt.id
                          ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
                          : 'border-[var(--border)] bg-[var(--bg-surface)]/50 text-[var(--text-sec)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {mode === 'auto' && (
                  <div className="flex items-center gap-2 min-h-[44px]">
                    <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/50 px-3 py-2.5 font-mono text-base font-semibold tabular-nums" dir="ltr">
                      {storeMarkup}%
                    </div>
                    <span className="text-xs text-[var(--text-muted)] max-w-[12rem]">
                      {formatMessage(t.pricingModeAutoHint || 'Uses store markup {markup}% on each sync.', {
                        markup: storeMarkup,
                      })}
                    </span>
                  </div>
                )}

                {mode === 'margin' && (
                  <PricingEditableValue
                    label={t.pricingCustomMargin || 'Pack margin %'}
                    value={form.pricing_margin_percent}
                    displayValue={
                      form.pricing_margin_percent === '' || form.pricing_margin_percent == null
                        ? '— %'
                        : `${form.pricing_margin_percent}%`
                    }
                    suffix="%"
                    min={0}
                    max={500}
                    step={0.5}
                    t={t}
                    onCommit={(v) => setForm((prev) => ({ ...prev, pricing_margin_percent: v }))}
                  />
                )}

                {mode === 'fixed' && (
                  <p className="text-xs text-amber-300/90">
                    {t.pricingModeFixedHint || 'This price will not change when you sync the catalog.'}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mode === 'fixed' ? (
                    <PricingEditableValue
                      label={t.price || 'Customer price'}
                      value={form.price}
                      displayValue={
                        form.price === '' || form.price == null
                          ? '—'
                          : `$${Number(form.price).toFixed(2)}`
                      }
                      prefix="$"
                      min={0.01}
                      step={0.01}
                      t={t}
                      onCommit={(v) => handlePriceEdit(v)}
                    />
                  ) : (
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">
                        {t.price || 'Customer price'}
                      </label>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/50 px-3 py-2.5 font-mono text-base font-semibold tabular-nums min-h-[44px] flex items-center" dir="ltr">
                        {form.price !== '' && form.price != null
                          ? `$${Number(form.price).toFixed(2)}`
                          : '—'}
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        {t.pricingPriceComputedHint || 'Computed from cost + margin. Choose Fixed to set a custom price.'}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">
                      {t.g2bulkCostUsd || 'Supplier cost (USD)'}
                    </label>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/50 px-3 py-2.5 font-mono text-sm tabular-nums min-h-[44px] flex items-center text-[var(--text-sec)]" dir="ltr">
                      {form.g2bulk_cost_usd !== '' && form.g2bulk_cost_usd != null
                        ? `$${Number(form.g2bulk_cost_usd)}`
                        : '—'}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      {t.pricingCostFromSync || 'Updated automatically on G2Bulk sync.'}
                    </p>
                  </div>
                </div>

                {previewPrice != null && Number.isFinite(cost) && cost > 0 && (
                  <div className="text-xs text-[var(--text-sec)] rounded-lg border border-[var(--border)] px-3 py-2 bg-[var(--bg-surface)]/40">
                    {formatMessage(t.pricingPreviewLine || 'Cost {cost} → customer {price}', {
                      cost: `$${cost.toFixed(4)}`,
                      price: `$${Number(previewPrice).toFixed(2)}`,
                    })}
                  </div>
                )}

                <button
                  type="button"
                  disabled={pricingSaving}
                  onClick={() => savePricingToDatabase()}
                  className="btn btn-primary text-sm w-full sm:w-auto disabled:opacity-60"
                >
                  {pricingSaving
                    ? (t.uploading || 'Saving…')
                    : (t.pricingSaveToDb || t.pricingEditDone || 'Save pricing to database')}
                </button>
              </>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
            <input
              type="checkbox"
              checked={!!form.is_sale}
              onChange={(e) => setForm({
                ...form,
                is_sale: e.target.checked,
                original_price: e.target.checked ? form.original_price : '',
                pricing_mode: e.target.checked ? 'fixed' : form.pricing_mode,
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

          <div className="rounded-xl border border-[var(--border)] p-3 space-y-3 bg-[var(--bg-primary)]/40">
            <div className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide">G2Bulk</div>
            <select
              value={form.g2bulk_type}
              onChange={(e) => setForm({ ...form, g2bulk_type: e.target.value })}
              className="input w-full text-sm"
            >
              <option value="">{t.g2bulkTypeAuto || 'Auto (from game redemption)'}</option>
              <option value="topup">{t.g2bulkTypeTopup || 'Direct top-up'}</option>
              <option value="voucher">{t.g2bulkTypeVoucher || 'Gift card / voucher code'}</option>
            </select>
            <input
              placeholder={t.g2bulkCatalogueName || 'Catalogue name e.g. 60 UC'}
              value={form.g2bulk_catalogue_name}
              onChange={(e) => setForm({ ...form, g2bulk_catalogue_name: e.target.value })}
              className="input w-full text-sm font-mono"
            />
            <input
              type="number"
              placeholder={t.g2bulkProductId || 'Voucher product ID (gift cards)'}
              value={form.g2bulk_product_id}
              onChange={(e) => setForm({ ...form, g2bulk_product_id: e.target.value })}
              className="input w-full text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.description}</label>
            <textarea
              placeholder={t.descriptionOneEnough}
              value={form.description_en}
              onChange={(e) => setForm({ ...form, description_en: e.target.value })}
              className="input w-full h-24 resize-y"
            />
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
              {t.offerDescriptionPlaceholderHelp}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.salePhotoOptional || 'Sale photo (optional)'}</label>
            <SiteImagePicker
              t={t}
              games={games}
              offers={offers}
              g2bulkGameCode={selectedGame?.g2bulk_game_code || ''}
              g2bulkCategoryId={g2bulkCategoryId}
              fieldLabel={t.siteImagePickerSale}
              onSelect={(url) => {
                setSaleCoverFile(null);
                setForm((prev) => ({ ...prev, sale_image_url: url }));
              }}
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSaleCoverFile(e.target.files?.[0] || null)}
              className="input text-sm mt-2 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[var(--accent)] file:text-[#040812]"
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
              {saving
                ? (t.uploading || 'Saving...')
                : (isNew ? (t.addOffer || 'Add Offer') : (t.updateOffer || 'Update Offer'))}
            </button>
            <button type="button" onClick={onClose} className="btn btn-secondary px-5">
              {t.cancel || 'Cancel'}
            </button>
          </div>
        </form>
    </Modal>
  );
}
