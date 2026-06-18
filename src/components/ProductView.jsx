
import { ArrowLeft, ArrowRight, ShoppingCart, ShieldCheck, Zap } from 'lucide-react';

export default function ProductView({ t, lang, selectedProduct, onBack, addToCart }) {
  if (!selectedProduct) return null;

  const name = lang === 'ar' ? selectedProduct.name_ar : selectedProduct.name_en;
  const desc = lang === 'ar' ? selectedProduct.description_ar : selectedProduct.description_en;
  const placeholder = new URL('../assets/placeholder-cover.png', import.meta.url).href;
  const img = selectedProduct.image_url || placeholder;

  return (
    <div className="max-w-5xl mx-auto mt-6 animate-fade-in">
      <button 
        onClick={onBack} 
        className="mb-6 flex items-center gap-2 text-[var(--text-sec)] hover:text-[var(--accent)] font-semibold btn btn-ghost"
      >
        {lang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />} {t.back}
      </button>

      <div className="card overflow-hidden md:flex">
        {/* Hero Image Side */}
        <div className="md:w-5/12 relative">
          <img 
            src={img} 
            alt={name} 
            className="w-full h-72 md:h-full object-cover" 
            onError={e => e.currentTarget.src = placeholder}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent md:hidden" />
        </div>

        {/* Details */}
        <div className="p-8 md:p-12 flex-1 flex flex-col">
          <div>
            <div className="badge mb-3">{selectedProduct.category === 'games' ? 'GAME TOP-UP' : 'DIGITAL CARD'}</div>
            <h1 className="text-4xl md:text-5xl font-black leading-none mb-4">{name}</h1>
            
            <p className="text-[var(--text-sec)] text-lg mb-6 max-w-prose">
              {desc || t.instantDelivery}
            </p>

            <div className="flex gap-4 mb-8">
              <div className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
                <Zap className="w-4 h-4 text-[var(--accent)]" /> {lang === 'ar' ? 'تسليم فوري' : 'Instant Delivery'}
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
                <ShieldCheck className="w-4 h-4 text-[var(--accent)]" /> {lang === 'ar' ? 'آمن 100%' : '100% Secure'}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-[var(--text-muted)] tracking-widest">PRICE</div>
              <div className="text-5xl font-black bg-clip-text text-transparent bg-[var(--gradient-accent)]">
                ${parseFloat(selectedProduct.price).toFixed(2)}
              </div>
            </div>

            <button 
              onClick={(e) => addToCart(selectedProduct, e)} 
              className="btn btn-primary text-xl py-5 px-10 w-full sm:w-auto"
            >
              <ShoppingCart className="w-5 h-5" /> {t.addToCart}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

