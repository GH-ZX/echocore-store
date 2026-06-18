import { ShoppingCart } from 'lucide-react';

/**
 * Universal Product Card — fully DB driven.
 * Used everywhere (Home grid, recommended, etc.)
 * 
 * Props:
 * - product: from Supabase (must have name_en, name_ar, price, category, image_url?, color)
 * - lang: 'ar' | 'en'
 * - onSelect: (product) => void
 * - onAddToCart: (product) => void
 * - onBuyNow: (product) => void   // NEW: direct buy with UID page
 * - compact?: boolean
 */
export default function ProductCard({ 
  product, 
  t = {}, 
  lang = 'ar', 
  onSelect, 
  onAddToCart, 
  onBuyNow, 
  compact = false 
}) {
  const name = lang === 'ar' ? product.name_ar : product.name_en;
  const categoryLabel = product.category === 'games' 
    ? (t.game || (lang === 'ar' ? 'شحن ألعاب' : 'PC Games')) 
    : (t.digitalCard || (lang === 'ar' ? 'بطاقات رقمية' : 'Digital Cards'));

  // Fallback image (use placeholder or external)
  const placeholder = new URL('../assets/placeholder-cover.png', import.meta.url).href;
  const imgSrc = product.image_url || placeholder;

  const handleAdd = (e) => {
    e.stopPropagation();
    onAddToCart?.(product, e);
  };

  const handleBuyNow = (e) => {
    e.stopPropagation();
    if (onBuyNow) onBuyNow(product);
    else onSelect?.(product);
  };

  return (
    <div 
      onClick={() => onSelect?.(product)}
      className="card group flex flex-col overflow-hidden cursor-pointer h-full"
    >
      {/* Image */}
      <div className="relative h-44 w-full bg-[#02050f] overflow-hidden">
        <img
          src={imgSrc}
          alt={name}
          className="product-image absolute inset-0 w-full h-full object-cover brightness-[0.82] group-hover:brightness-100"
          onError={(e) => { e.currentTarget.src = placeholder; }}
        />
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        
        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <span className="badge">{categoryLabel}</span>
        </div>

        {/* Price badge */}
        {product.price > 0 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur px-3 py-0.5 rounded-full text-sm font-black text-white">
            ${parseFloat(product.price).toFixed(2)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-lg leading-tight text-white mb-1.5 line-clamp-2">
            {name}
          </h3>
          {!compact && (
            <p className="text-[13px] text-text-sec line-clamp-2 mb-3">
              {lang === 'ar' ? product.description_ar : product.description_en || 
                (t.instantDelivery || 'توصيل فوري • آمن 100%')}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-border gap-2">
          <div>
            <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-accent to-blue-400">
              ${parseFloat(product.price).toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onBuyNow && (
              <button
                onClick={handleBuyNow}
                className="btn btn-primary px-3 py-2 text-xs active:scale-[0.985]"
              >
                {lang === 'ar' ? 'اشترِ' : 'Buy'}
              </button>
            )}
            <button
              onClick={handleAdd}
              className="btn btn-secondary p-3 active:scale-[0.985]"
              title={t.addToCart || (lang === 'ar' ? 'أضف للسلة' : 'Add to cart')}
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
