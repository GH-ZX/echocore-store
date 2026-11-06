import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import HomeGameCard from '../components/ui/HomeGameCard';
import CatalogCategoryHeader from '../components/catalog/CatalogCategoryHeader';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import CatalogSearchBar from '../components/catalog/CatalogSearchBar';
import CatalogGrid from '../components/catalog/CatalogGrid';
import { countActiveOffers } from '../lib/catalogUtils';
import { getStorefrontManualProducts } from '../lib/gameRegions';
import { filterGamesByQuery } from '../lib/searchUtils';
import { categoryLabel, useCategories } from '../hooks/useCategories';

/** /store and /store/:categorySlug: products the store delivers itself, grouped by category. */
export default function StoreProductsView({
  games = [],
  offers = [],
  t = {},
  lang = 'ar',
  onSelectGame,
  onEditGame,
  isAdmin = false,
  loading = false,
}) {
  const navigate = useNavigate();
  const { categorySlug = '' } = useParams();
  const [query, setQuery] = useState('');
  const categories = useCategories();

  const products = useMemo(
    () => getStorefrontManualProducts(games)
      .map((game) => ({ ...game, offerCount: countActiveOffers(game.id, offers) }))
      .filter((game) => isAdmin || game.offerCount > 0),
    [games, offers, isAdmin],
  );

  const usedCategories = useMemo(
    () => categories.filter((cat) => products.some((game) => game.category_id === cat.id)),
    [categories, products],
  );
  const current = categorySlug ? categories.find((cat) => cat.slug === categorySlug) : null;

  const visible = useMemo(() => {
    const inCategory = current ? products.filter((game) => game.category_id === current.id) : products;
    if (!query.trim()) return inCategory;
    const ids = new Set(filterGamesByQuery(inCategory, query).map((game) => game.id));
    return inCategory.filter((game) => ids.has(game.id));
  }, [products, current, query]);

  const title = current ? categoryLabel(current, lang) : t.storeProductsTitle;
  const subtitle = current
    ? ((lang === 'ar' ? current.description_ar : current.description_en) || t.storeProductsDesc)
    : t.storeProductsDesc;
  const unknownCategory = categorySlug && categories.length > 0 && !current;

  return (
    <CatalogPageShell
      wide
      lang={lang}
      backLabel={t.backToHome}
      onBack={() => navigate(current ? '/store' : '/')}
      breadcrumb={current
        ? [{ label: t.storeProductsTitle, onClick: () => navigate('/store') }, { label: title }]
        : [{ label: title }]}
    >
      <CatalogCategoryHeader title={unknownCategory ? t.categoryNotFound : title} subtitle={subtitle} />

      {usedCategories.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mb-6" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!current}
            onClick={() => navigate('/store')}
            className={`action-chip text-sm ${!current ? 'btn-primary' : ''}`}
          >
            {t.all || t.storeProductsTitle}
          </button>
          {usedCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={current?.id === cat.id}
              onClick={() => navigate(`/store/${cat.slug}`)}
              className={`action-chip text-sm ${current?.id === cat.id ? 'btn-primary' : ''}`}
            >
              {categoryLabel(cat, lang)}
            </button>
          ))}
        </div>
      )}

      {products.length > 6 && (
        <CatalogSearchBar value={query} onChange={setQuery} placeholder={t.searchStoreProducts} />
      )}

      <CatalogGrid loading={loading} count={visible.length} emptyTitle={t.categoryEmpty}>
        {visible.map((game) => (
          <HomeGameCard
            key={game.id}
            game={game}
            lang={lang}
            t={t}
            offerCount={game.offerCount}
            onSelectGame={onSelectGame}
            onEditGame={onEditGame}
            isAdmin={isAdmin}
          />
        ))}
      </CatalogGrid>
    </CatalogPageShell>
  );
}
