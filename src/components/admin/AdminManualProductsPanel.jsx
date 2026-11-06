import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Plus, Pencil, FolderTree, Trash2, Save, Loader2, Truck } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { formatMessage } from '../../lib/i18n';
import { deleteCategory, fetchCategories, saveCategory, slugify } from '../../lib/manualProducts';

const NEW_CATEGORY = { name_ar: '', name_en: '', slug: '', sort_order: 0, active: true, show_on_home: true };

function CategoryRow({ category, t, onSaved, onDelete }) {
  const [draft, setDraft] = useState(category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(category);

  const save = async () => {
    if (!draft.name_ar.trim() && !draft.name_en.trim()) {
      setError(t.categoryNeedsName);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await saveCategory(draft);
      onSaved(saved, category.id ? null : category);
      if (!category.id) setDraft(NEW_CATEGORY);
    } catch (err) {
      setError(err.code === '23505' ? t.manualSlugTaken : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/40 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_10rem_5rem] gap-2">
        <input className="input w-full" dir="rtl" placeholder={t.categoryNameAr} value={draft.name_ar} maxLength={80}
          onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })} />
        <input className="input w-full" dir="ltr" placeholder={t.categoryNameEn} value={draft.name_en} maxLength={80}
          onChange={(e) => setDraft({ ...draft, name_en: e.target.value, ...(category.id ? {} : { slug: slugify(e.target.value) }) })} />
        <input className="input w-full" dir="ltr" placeholder={t.categorySlug} value={draft.slug} maxLength={48}
          onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) || e.target.value.toLowerCase() })} />
        <input className="input w-full" dir="ltr" type="number" title={t.categorySort} placeholder={t.categorySort} value={draft.sort_order}
          onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
          {t.categoryActive}
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={draft.show_on_home} onChange={(e) => setDraft({ ...draft, show_on_home: e.target.checked })} />
          {t.categoryShowOnHome}
        </label>
        <span className="flex-1" />
        {category.id && (
          <button type="button" className="btn btn-secondary text-xs inline-flex items-center gap-1 text-red-400" onClick={() => onDelete(category)}>
            <Trash2 className="w-3.5 h-3.5" />
            {t.deleteCategory}
          </button>
        )}
        <button type="button" disabled={busy || (!dirty && !!category.id)} onClick={save}
          className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (category.id ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />)}
          {category.id ? t.saveCategory : t.addCategory}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function AdminManualProductsPanel({ games = [], offers = [], lang = 'ar', t = {}, onEditProduct, onNotify }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setCategories(await fetchCategories({ includeInactive: true }));
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => { load(); }, [load]);

  const products = useMemo(
    () => games.filter((game) => game.delivery_mode === 'manual')
      .map((game) => ({
        ...game,
        packCount: offers.filter((offer) => offer.game_id === game.id && offer.active !== false).length,
      })),
    [games, offers],
  );

  const categoryName = (id) => {
    const cat = categories.find((row) => row.id === id);
    if (!cat) return t.noCategory;
    return (lang === 'ar' ? cat.name_ar : cat.name_en) || cat.name_ar || cat.name_en;
  };

  const name = (game) => (lang === 'ar' ? game.name_ar : game.name_en) || game.name_ar || game.name_en;

  return (
    <div className="card p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Truck className="w-5 h-5 text-[var(--accent)]" />
            {t.manualProductsTitle}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xl">{t.manualProductHelp}</p>
        </div>
        <button type="button" className="btn btn-primary inline-flex items-center gap-1.5"
          onClick={() => onEditProduct?.({ id: null, delivery_mode: 'manual' })}>
          <Plus className="w-4 h-4" />
          {t.addManualProduct}
        </button>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-[var(--text-sec)]">{t.manualProductsEmpty}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map((game) => (
            <button key={game.id} type="button" onClick={() => onEditProduct?.(game)}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/40 p-3 text-start hover:border-[var(--accent)]/50 transition-colors">
              {game.image_url || game.logo_url ? (
                <img src={game.logo_url || game.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="w-12 h-12 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-[var(--text-muted)]" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold truncate">{name(game)}</span>
                <span className="block text-xs text-[var(--text-muted)] truncate">
                  {categoryName(game.category_id)} · {formatMessage(t.manualPackCount, { count: game.packCount })}
                  {game.active === false ? ' · —' : ''}
                </span>
              </span>
              <Pencil className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h4 className="font-bold flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-[var(--accent)]" />
          {t.categoriesManager}
        </h4>
        <p className="text-xs text-[var(--text-muted)]">{t.categoriesHelp}</p>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
        ) : (
          <>
            {categories.length === 0 && <p className="text-sm text-[var(--text-sec)]">{t.noCategories}</p>}
            {categories.map((category) => (
              <CategoryRow
                key={`${category.id}-${category.updated_at}`}
                category={category}
                t={t}
                onSaved={(saved) => {
                  setCategories((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
                  onNotify?.(t.categorySaved, 'success');
                }}
                onDelete={setToDelete}
              />
            ))}
            <CategoryRow
              key={`new-${categories.length}`}
              category={NEW_CATEGORY}
              t={t}
              onSaved={(saved) => {
                setCategories((prev) => [...prev, saved]);
                onNotify?.(t.categorySaved, 'success');
              }}
              onDelete={() => {}}
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={t.deleteCategory}
        message={t.deleteCategoryConfirm}
        confirmLabel={t.deleteCategory}
        cancelLabel={t.cancel}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const target = toDelete;
          setToDelete(null);
          try {
            await deleteCategory(target.id);
            setCategories((prev) => prev.filter((row) => row.id !== target.id));
            onNotify?.(t.categoryDeleted, 'success');
          } catch (err) {
            onNotify?.(err.message, 'error');
          }
        }}
      />
    </div>
  );
}
