import { useEffect, useMemo, useState } from 'react';
import {
  X, Package, Truck, ListChecks, Tag, Image as ImageIcon, Upload, Plus, Trash2, ArrowUp, ArrowDown, Loader2, EyeOff,
} from 'lucide-react';
import Modal from '../ui/Modal';
import { uploadImage } from '../../lib/uploadImage';
import {
  CUSTOMER_FIELD_TYPES,
  MAX_CUSTOMER_FIELDS,
  fetchCategories,
  fetchManualPackages,
  normalizeCustomerFields,
  saveManualProduct,
  slugify,
} from '../../lib/manualProducts';

const FIELD_TYPE_LABEL = {
  text: 'fieldTypeText',
  email: 'fieldTypeEmail',
  phone: 'fieldTypePhone',
  number: 'fieldTypeNumber',
  textarea: 'fieldTypeTextarea',
};

function Label({ icon: Icon, children, required }) {
  return (
    <label className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-sec)] mb-1">
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      <span>{children}</span>
      {required && <span className="text-red-400">*</span>}
    </label>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h3 className="flex items-center gap-1.5 text-sm font-bold text-[var(--accent)]">
      <Icon className="w-4 h-4 shrink-0" />
      {children}
    </h3>
  );
}

function emptyForm(game) {
  return {
    name_ar: game?.name_ar || '',
    name_en: game?.name_en || '',
    slug: game?.slug || '',
    description_ar: game?.description_ar || '',
    description_en: game?.description_en || '',
    category_id: game?.category_id || '',
    image_url: game?.image_url || '',
    logo_url: game?.logo_url || '',
    card_badge_ar: game?.card_badge_ar || '',
    card_badge_en: game?.card_badge_en || '',
    delivery_eta_ar: game?.delivery_eta_ar || '',
    delivery_eta_en: game?.delivery_eta_en || '',
    delivery_note_ar: game?.delivery_note_ar || '',
    delivery_note_en: game?.delivery_note_en || '',
    customer_fields: normalizeCustomerFields(game?.customer_fields || []),
    active: game?.active !== false,
  };
}

export default function AdminManualProductModal({ game, lang = 'ar', t = {}, onClose }) {
  const isNew = !game?.id;
  const [form, setForm] = useState(() => emptyForm(game));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [packages, setPackages] = useState(isNew ? [{ name_ar: '', name_en: '', price: '', active: true }] : []);
  const [removedIds, setRemovedIds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [loadingPacks, setLoadingPacks] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCategories({ includeInactive: true })
      .then((rows) => { if (!cancelled) setCategories(rows); })
      .catch(() => { if (!cancelled) setCategories([]); });
    if (!isNew) {
      fetchManualPackages(game.id)
        .then((rows) => {
          if (cancelled) return;
          setPackages(rows.map((row) => ({ ...row, price: String(row.price) })));
        })
        .catch((err) => { if (!cancelled) setError(err.message); })
        .finally(() => { if (!cancelled) setLoadingPacks(false); });
    }
    return () => { cancelled = true; };
  }, [game?.id, isNew]);

  const imagePreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : form.image_url), [imageFile, form.image_url]);
  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : form.logo_url), [logoFile, form.logo_url]);
  useEffect(() => () => {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);
  useEffect(() => () => {
    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const setNameEn = (value) => {
    set({ name_en: value, ...(slugTouched ? {} : { slug: slugify(value) }) });
  };

  const updateField = (index, patch) => {
    setForm((prev) => ({
      ...prev,
      customer_fields: prev.customer_fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }));
  };

  const moveField = (index, delta) => {
    setForm((prev) => {
      const next = [...prev.customer_fields];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, customer_fields: next };
    });
  };

  const addField = () => {
    setForm((prev) => (prev.customer_fields.length >= MAX_CUSTOMER_FIELDS ? prev : {
      ...prev,
      customer_fields: [...prev.customer_fields, { key: '', label_ar: '', label_en: '', placeholder_ar: '', placeholder_en: '', type: 'text', required: true }],
    }));
  };

  const removeField = (index) => {
    setForm((prev) => ({ ...prev, customer_fields: prev.customer_fields.filter((_, i) => i !== index) }));
  };

  const updatePackage = (index, patch) => {
    setPackages((prev) => prev.map((pack, i) => (i === index ? { ...pack, ...patch } : pack)));
  };

  const removePackage = (index) => {
    setPackages((prev) => {
      const pack = prev[index];
      if (pack?.id) setRemovedIds((ids) => [...ids, pack.id]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaved('');

    if (!form.name_ar.trim() && !form.name_en.trim()) {
      setError(t.manualNeedsName);
      return;
    }
    if (form.customer_fields.some((field) => !field.label_ar.trim() && !field.label_en.trim())) {
      setError(t.manualFieldInvalid);
      return;
    }
    const livePacks = packages.filter((pack) => pack.active !== false);
    if (livePacks.length === 0) {
      setError(t.manualNeedsPackage);
      return;
    }
    if (packages.some((pack) => !(pack.name_ar.trim() || pack.name_en.trim()) || !(Number(pack.price) > 0))) {
      setError(t.manualPackageInvalid);
      return;
    }

    setSaving(true);
    try {
      let imageUrl = form.image_url.trim() || null;
      let logoUrl = form.logo_url.trim() || null;
      if (imageFile) imageUrl = await uploadImage(imageFile, 'game-cover');
      if (logoFile) logoUrl = await uploadImage(logoFile, 'game-logo');

      const result = await saveManualProduct(
        {
          ...form,
          id: game?.id || null,
          slug: form.slug || slugify(form.name_en),
          image_url: imageUrl,
          logo_url: logoUrl,
          category_id: form.category_id || null,
        },
        packages,
        { removedPackageIds: removedIds },
      );
      setImageFile(null);
      setLogoFile(null);
      setRemovedIds([]);
      set({ image_url: result.game.image_url || '', logo_url: result.game.logo_url || '', slug: result.game.slug });
      setPackages(result.offers
        .filter((row) => row.active !== false)
        .map((row) => ({ ...row, price: String(row.price) })));
      setSaved(t.manualSaved);
      if (isNew) onClose?.();
    } catch (err) {
      setError(err.message === 'slug_taken' ? t.manualSlugTaken : (err.message || t.failedToSaveGame));
    } finally {
      setSaving(false);
    }
  };

  const catName = (cat) => (lang === 'ar' ? cat.name_ar : cat.name_en) || cat.name_ar || cat.name_en;

  return (
    <Modal open={!!game} onClose={onClose} size="xl" zIndex={100} ariaLabelledBy="admin-manual-product-title">
      <div className="modal-panel__header">
        <h2 id="admin-manual-product-title" className="text-lg font-bold flex items-center gap-2">
          <Package className="w-5 h-5 text-[var(--accent)]" />
          {isNew ? t.addManualProduct : t.editManualProduct}
        </h2>
        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5" aria-label={t.close || 'Close'}>
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{t.manualProductHelp}</p>

        {/* Product */}
        <section className="space-y-3">
          <SectionTitle icon={Package}>{t.manualProductBasics}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label required>{t.productNameAr}</Label>
              <input className="input w-full" dir="rtl" value={form.name_ar} maxLength={120}
                onChange={(e) => set({ name_ar: e.target.value })} />
            </div>
            <div>
              <Label>{t.productNameEn}</Label>
              <input className="input w-full" dir="ltr" value={form.name_en} maxLength={120}
                onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div>
              <Label>{t.productDescAr}</Label>
              <textarea className="input w-full h-20 resize-y" dir="rtl" value={form.description_ar} maxLength={2000}
                onChange={(e) => set({ description_ar: e.target.value })} />
            </div>
            <div>
              <Label>{t.productDescEn}</Label>
              <textarea className="input w-full h-20 resize-y" dir="ltr" value={form.description_en} maxLength={2000}
                onChange={(e) => set({ description_en: e.target.value })} />
            </div>
            <div>
              <Label>{t.productCategory}</Label>
              <select className="input w-full" value={form.category_id} onChange={(e) => set({ category_id: e.target.value })}>
                <option value="">{t.noCategory}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{catName(cat)}{cat.active ? '' : ' (—)'}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t.productSlug}</Label>
              <input className="input w-full" dir="ltr" value={form.slug} maxLength={48}
                onChange={(e) => { setSlugTouched(true); set({ slug: slugify(e.target.value) || e.target.value.toLowerCase() }); }} />
              <p className="text-[10px] text-[var(--text-muted)] mt-1">{t.productSlugHelp}</p>
            </div>
            <div>
              <Label icon={Tag}>{t.productBadgeAr}</Label>
              <input className="input w-full" dir="rtl" value={form.card_badge_ar} maxLength={30}
                onChange={(e) => set({ card_badge_ar: e.target.value })} />
            </div>
            <div>
              <Label icon={Tag}>{t.productBadgeEn}</Label>
              <input className="input w-full" dir="ltr" value={form.card_badge_en} maxLength={30}
                onChange={(e) => set({ card_badge_en: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label icon={ImageIcon}>{t.productImage}</Label>
              {imagePreview && (
                <img src={imagePreview} alt="" className="w-full h-32 object-cover rounded-xl border border-[var(--border)] mb-2" />
              )}
              <label className="btn btn-secondary text-sm inline-flex items-center gap-1.5 cursor-pointer w-full justify-center">
                <Upload className="w-3.5 h-3.5" />
                {t.upload || 'Upload'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
              </label>
              <input className="input w-full text-sm mt-2" dir="ltr" placeholder={t.productImageUrl} value={form.image_url}
                onChange={(e) => { setImageFile(null); set({ image_url: e.target.value }); }} />
            </div>
            <div>
              <Label icon={ImageIcon}>{t.productLogo}</Label>
              {logoPreview && (
                <img src={logoPreview} alt=""
                  className="w-16 h-16 object-contain rounded-xl border border-[var(--border)] mb-2" />
              )}
              <label className="btn btn-secondary text-sm inline-flex items-center gap-1.5 cursor-pointer w-full justify-center">
                <Upload className="w-3.5 h-3.5" />
                {t.upload || 'Upload'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
              </label>
              <input className="input w-full text-sm mt-2" dir="ltr" placeholder={t.orPasteLogoURL || 'Logo URL'} value={form.logo_url}
                onChange={(e) => { setLogoFile(null); set({ logo_url: e.target.value }); }} />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            {t.productActive}
          </label>
        </section>

        {/* Options and prices */}
        <section className="space-y-3">
          <SectionTitle icon={Tag}>{t.packagesSection}</SectionTitle>
          <p className="text-[11px] text-[var(--text-muted)]">{t.packagesHelp}</p>
          {loadingPacks ? (
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          ) : (
            <div className="space-y-2">
              {packages.map((pack, index) => (
                <div key={pack.id || `new-${index}`} className={`grid grid-cols-[1fr_1fr_6rem_auto] gap-2 items-end ${pack.active === false ? 'opacity-60' : ''}`}>
                  <div>
                    {index === 0 && <Label required>{t.packageNameAr}</Label>}
                    <input className="input w-full" dir="rtl" value={pack.name_ar} maxLength={120}
                      onChange={(e) => updatePackage(index, { name_ar: e.target.value })} />
                  </div>
                  <div>
                    {index === 0 && <Label>{t.packageNameEn}</Label>}
                    <input className="input w-full" dir="ltr" value={pack.name_en} maxLength={120}
                      onChange={(e) => updatePackage(index, { name_en: e.target.value })} />
                  </div>
                  <div>
                    {index === 0 && <Label required>{t.packagePrice}</Label>}
                    <input className="input w-full" dir="ltr" type="number" min="0.01" step="0.01" value={pack.price}
                      onChange={(e) => updatePackage(index, { price: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-1">
                    {pack.active === false && (
                      <button type="button" className="btn btn-secondary text-xs px-2 py-2" title={t.packageHidden}
                        onClick={() => updatePackage(index, { active: true })}>
                        <EyeOff className="w-4 h-4" />
                      </button>
                    )}
                    <button type="button" className="p-2 rounded-lg hover:bg-red-500/10 text-red-400" title={t.removePackage}
                      aria-label={t.removePackage} onClick={() => removePackage(index)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-secondary text-sm inline-flex items-center gap-1.5"
                onClick={() => setPackages((prev) => [...prev, { name_ar: '', name_en: '', price: '', active: true }])}>
                <Plus className="w-4 h-4" />
                {t.addPackage}
              </button>
            </div>
          )}
        </section>

        {/* Delivery */}
        <section className="space-y-3">
          <SectionTitle icon={Truck}>{t.deliverySection}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t.deliveryEtaAr}</Label>
              <input className="input w-full" dir="rtl" value={form.delivery_eta_ar} maxLength={80}
                placeholder={t.deliveryEtaPlaceholderAr} onChange={(e) => set({ delivery_eta_ar: e.target.value })} />
            </div>
            <div>
              <Label>{t.deliveryEtaEn}</Label>
              <input className="input w-full" dir="ltr" value={form.delivery_eta_en} maxLength={80}
                placeholder={t.deliveryEtaPlaceholderEn} onChange={(e) => set({ delivery_eta_en: e.target.value })} />
            </div>
            <div>
              <Label>{t.deliveryNoteAr}</Label>
              <textarea className="input w-full h-20 resize-y" dir="rtl" value={form.delivery_note_ar} maxLength={1000}
                placeholder={t.deliveryNotePlaceholderAr} onChange={(e) => set({ delivery_note_ar: e.target.value })} />
            </div>
            <div>
              <Label>{t.deliveryNoteEn}</Label>
              <textarea className="input w-full h-20 resize-y" dir="ltr" value={form.delivery_note_en} maxLength={1000}
                placeholder={t.deliveryNotePlaceholderEn} onChange={(e) => set({ delivery_note_en: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Customer questions */}
        <section className="space-y-3">
          <SectionTitle icon={ListChecks}>{t.customerFieldsSection}</SectionTitle>
          <p className="text-[11px] text-[var(--text-muted)]">{t.customerFieldsHelp}</p>
          {form.customer_fields.length === 0 && (
            <p className="text-xs text-[var(--text-sec)] rounded-xl border border-dashed border-[var(--border)] p-3">{t.customerFieldsEmpty}</p>
          )}
          {form.customer_fields.map((field, index) => (
            <div key={index} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/40 p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label required>{t.fieldLabelAr}</Label>
                  <input className="input w-full" dir="rtl" value={field.label_ar} maxLength={80}
                    onChange={(e) => updateField(index, { label_ar: e.target.value })} />
                </div>
                <div>
                  <Label>{t.fieldLabelEn}</Label>
                  <input className="input w-full" dir="ltr" value={field.label_en} maxLength={80}
                    onChange={(e) => updateField(index, { label_en: e.target.value })} />
                </div>
                <div>
                  <Label>{t.fieldPlaceholderAr}</Label>
                  <input className="input w-full" dir="rtl" value={field.placeholder_ar} maxLength={120}
                    onChange={(e) => updateField(index, { placeholder_ar: e.target.value })} />
                </div>
                <div>
                  <Label>{t.fieldPlaceholderEn}</Label>
                  <input className="input w-full" dir="ltr" value={field.placeholder_en} maxLength={120}
                    onChange={(e) => updateField(index, { placeholder_en: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                  {t.fieldType}
                  <select className="input py-1 text-xs" value={field.type} onChange={(e) => updateField(index, { type: e.target.value })}>
                    {CUSTOMER_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>{t[FIELD_TYPE_LABEL[type]] || type}</option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={field.required} onChange={(e) => updateField(index, { required: e.target.checked })} />
                  {t.fieldRequired}
                </label>
                <span className="flex-1" />
                <button type="button" className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30" disabled={index === 0}
                  title={t.moveUp} aria-label={t.moveUp} onClick={() => moveField(index, -1)}>
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button type="button" className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30" disabled={index === form.customer_fields.length - 1}
                  title={t.moveDown} aria-label={t.moveDown} onClick={() => moveField(index, 1)}>
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button type="button" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400"
                  title={t.removeField} aria-label={t.removeField} onClick={() => removeField(index)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {form.customer_fields.length < MAX_CUSTOMER_FIELDS && (
            <button type="button" className="btn btn-secondary text-sm inline-flex items-center gap-1.5" onClick={addField}>
              <Plus className="w-4 h-4" />
              {t.addCustomerField}
            </button>
          )}
        </section>

        {error && <div className="rounded border border-red-500/60 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>}
        {saved && <div className="rounded border border-green-500/40 bg-green-500/10 p-2 text-xs text-green-400">{saved}</div>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving || loadingPacks} className="btn btn-primary flex-1 py-3 disabled:opacity-60">
            {saving ? (t.uploading || 'Saving…') : t.saveProduct}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-secondary px-5 disabled:opacity-60">
            {t.cancel || 'Cancel'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
