export default function CatalogCategoryHeader({
  title,
  subtitle,
}) {
  return (
    <header className="catalog-category-header mb-6 sm:mb-8">
      <h1 className="catalog-category-header__title text-2xl sm:text-3xl md:text-4xl font-black leading-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="catalog-category-header__subtitle text-sm sm:text-base mt-2 max-w-[56ch]">
          {subtitle}
        </p>
      )}
    </header>
  );
}