import { useEffect, useMemo, useState } from 'react';
import { Loader2, Percent, Plus, Trash2, Save, Pencil, AlertTriangle } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { getDisplayGameForOffer } from '../../lib/gameRegions';
import { getOfferDisplayName } from '../../lib/offerDisplay';
import { getSalePriceLossInfo } from '../../lib/offerCost';
import {
  buildRemoveSalePayload,
  buildSaleDiscountPayload,
  formatCatalogBasePrice,
  formatOfferPickerLabel,
  getOfferDiscount,
  getSaleOffers,
  validateSaleDiscountInputs,
} from '../../lib/saleOffers';
import { formatMessage } from '../../lib/i18n';

const EMPTY_FORM = {
  offerId: '',
  originalPrice: '',
  salePrice: '',
};

export default function AdminSaleDiscountsManager({
  t = {},
  lang = 'ar',
  games = [],
  offers = [],
  updateProduct,
  onNotify,
  presetEditOfferId = null,
  onPresetEditConsumed,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingOfferId, setEditingOfferId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [lossConfirmOpen, setLossConfirmOpen] = useState(false);

  const activeOffers = useMemo(
    () => offers.filter((offer) => offer.active !== false),
    [offers],
  );

  const saleOffers = useMemo(() => getSaleOffers(offers), [offers]);

  const pickerOffers = useMemo(() => {
    return activeOffers
      .filter((offer) => !offer.is_sale || offer.id === editingOfferId)
      .sort((a, b) => formatOfferPickerLabel(a, games, lang, offers).localeCompare(
        formatOfferPickerLabel(b, games, lang, offers),
        lang === 'ar' ? 'ar' : 'en',
      ));
  }, [activeOffers, editingOfferId, games, lang, offers]);

  const selectedOffer = useMemo(
    () => activeOffers.find((row) => row.id === form.offerId) || null,
    [activeOffers, form.offerId],
  );

  const previewDiscount = useMemo(() => {
    const result = validateSaleDiscountInputs(form.salePrice, form.originalPrice);
    if (!result.valid) return null;
    return Math.round((1 - result.sale / result.original) * 100);
  }, [form.originalPrice, form.salePrice]);

  const lossInfo = useMemo(
    () => getSalePriceLossInfo(selectedOffer, form.salePrice),
    [selectedOffer, form.salePrice],
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingOfferId(null);
  };

  const handleOfferSelect = (offerId) => {
    const offer = activeOffers.find((row) => row.id === offerId);
    if (!offer) {
      setForm((prev) => ({ ...prev, offerId: '' }));
      return;
    }

    if (offer.is_sale && offer.id === editingOfferId) {
      setForm({
        offerId: offer.id,
        originalPrice: offer.original_price ?? '',
        salePrice: offer.price ?? '',
      });
      return;
    }

    setForm({
      offerId: offer.id,
      originalPrice: formatCatalogBasePrice(offer),
      salePrice: '',
    });
  };

  const startEdit = (offer) => {
    setEditingOfferId(offer.id);
    setForm({
      offerId: offer.id,
      originalPrice: offer.original_price ?? '',
      salePrice: offer.price ?? '',
    });
  };

  useEffect(() => {
    if (!presetEditOfferId) return;
    const offer = offers.find((row) => row.id === presetEditOfferId && row.is_sale);
    if (!offer) {
      onPresetEditConsumed?.();
      return;
    }
    startEdit(offer);
    onPresetEditConsumed?.();
  }, [presetEditOfferId, offers, onPresetEditConsumed]);

  const executeSave = async () => {
    const offer = activeOffers.find((row) => row.id === form.offerId);
    if (!offer) {
      onNotify?.(t.adminSaleDiscountPickOffer, 'error');
      return;
    }

    const validation = validateSaleDiscountInputs(form.salePrice, form.originalPrice);
    if (!validation.valid) {
      onNotify?.(t[validation.errorKey] || t.adminSaleDiscountInvalidSalePrice, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = buildSaleDiscountPayload(offer, {
        salePrice: validation.sale,
        originalPrice: validation.original,
      });
      await updateProduct(payload);
      onNotify?.(t.adminSaleDiscountSaved, 'success');
      resetForm();
    } catch (err) {
      onNotify?.(err.message || t.adminSaleDiscountSaveFailed, 'error');
    } finally {
      setSaving(false);
      setLossConfirmOpen(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedOffer) {
      onNotify?.(t.adminSaleDiscountPickOffer, 'error');
      return;
    }

    const validation = validateSaleDiscountInputs(form.salePrice, form.originalPrice);
    if (!validation.valid) {
      onNotify?.(t[validation.errorKey] || t.adminSaleDiscountInvalidSalePrice, 'error');
      return;
    }

    if (lossInfo.isLoss) {
      setLossConfirmOpen(true);
      return;
    }

    await executeSave();
  };

  const handleRemove = async (offer) => {
    setRemovingId(offer.id);
    try {
      await updateProduct(buildRemoveSalePayload(offer));
      onNotify?.(t.adminSaleDiscountRemoved, 'success');
      if (editingOfferId === offer.id) resetForm();
    } catch (err) {
      onNotify?.(err.message || t.adminSaleDiscountRemoveFailed, 'error');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div id="admin-sale-discounts" className="card p-4 sm:p-6 space-y-6 scroll-mt-24">
      <div>
        <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <Percent className="w-5 h-5 text-[var(--accent)]" />
          {t.adminSaleDiscountsTitle}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-3xl">
          {t.adminSaleDiscountsHelp}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 sm:p-5 space-y-4">
        <div className="text-sm font-semibold">
          {editingOfferId ? t.adminSaleDiscountEditHeading : t.adminSaleDiscountAddHeading}
        </div>

        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {t.adminSaleDiscountPickOfferLabel}
          </label>
          <select
            required
            value={form.offerId}
            onChange={(e) => handleOfferSelect(e.target.value)}
            className="input w-full"
            disabled={!!editingOfferId}
          >
            <option value="">{t.adminSaleDiscountPickOffer}</option>
            {pickerOffers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {formatOfferPickerLabel(offer, games, lang, offers)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {t.adminSaleDiscountOriginalPrice}
            </label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.originalPrice}
              onChange={(e) => setForm((prev) => ({ ...prev, originalPrice: e.target.value }))}
              className="input w-full"
              placeholder={t.originalPriceBeforeDiscount}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {t.adminSaleDiscountSalePrice}
            </label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.salePrice}
              onChange={(e) => setForm((prev) => ({ ...prev, salePrice: e.target.value }))}
              className="input w-full"
              placeholder={t.price}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {previewDiscount != null && previewDiscount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-bold text-[var(--accent)]">
              <Percent className="w-3.5 h-3.5" />
              {formatMessage(t.adminSaleDiscountPreview, { percent: previewDiscount })}
            </div>
          )}
          {lossInfo.isLoss && lossInfo.cost != null && (
            <div className="inline-flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 max-w-xl">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {formatMessage(t.adminSaleDiscountLossInline, {
                sale: `$${lossInfo.sale.toFixed(2)}`,
                cost: `$${lossInfo.cost.toFixed(2)}`,
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || !form.offerId}
            className="btn btn-primary action-chip gap-2 !border-0 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingOfferId ? t.adminSaleDiscountUpdate : t.adminSaleDiscountAdd}
          </button>
          {(editingOfferId || form.offerId) && (
            <button type="button" onClick={resetForm} className="action-chip gap-2">
              {t.cancel}
            </button>
          )}
        </div>
      </form>

      <div>
        <div className="text-sm font-semibold mb-3">
          {formatMessage(t.adminSaleDiscountActiveCount, { count: saleOffers.length })}
        </div>

        {saleOffers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
            {t.adminSaleDiscountEmpty}
          </div>
        ) : (
          <div className="space-y-2">
            {saleOffers.map((offer) => {
              const game = getDisplayGameForOffer(offer, games);
              const discount = getOfferDiscount(offer);
              const offerName = getOfferDisplayName(offer, lang, { game, games, relatedOffers: offers });
              const gameName = game ? (lang === 'ar' ? game.name_ar : game.name_en) : '—';
              const busy = removingId === offer.id;

              return (
                <div
                  key={offer.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{offerName}</div>
                    <div className="text-xs text-[var(--text-muted)] truncate">{gameName}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm">
                      <span className="line-through text-[var(--text-muted)]">
                        ${Number.parseFloat(offer.original_price).toFixed(2)}
                      </span>
                      <span className="font-bold text-[var(--accent)]">
                        ${Number.parseFloat(offer.price).toFixed(2)}
                      </span>
                      {discount > 0 && (
                        <span className="sale-offer-discount px-2 py-0.5 text-[10px] font-bold rounded-md border">
                          -{discount}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => startEdit(offer)}
                      className="p-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/40 text-[var(--accent)]"
                      title={t.edit}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(offer)}
                      disabled={busy}
                      className="p-2 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      title={t.adminSaleDiscountRemove}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-[var(--text-muted)] flex items-start gap-2">
        <Plus className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        {t.adminSaleDiscountStorefrontNote}
      </p>

      <ConfirmDialog
        open={lossConfirmOpen}
        title={t.adminSaleDiscountLossConfirmTitle}
        message={lossInfo.isLoss && lossInfo.cost != null ? formatMessage(t.adminSaleDiscountLossConfirmBody, {
          sale: `$${lossInfo.sale.toFixed(2)}`,
          cost: `$${lossInfo.cost.toFixed(2)}`,
        }) : ''}
        confirmLabel={t.adminSaleDiscountLossConfirmAction}
        cancelLabel={t.cancel}
        variant="danger"
        loading={saving}
        onConfirm={executeSave}
        onCancel={() => setLossConfirmOpen(false)}
      />
    </div>
  );
}