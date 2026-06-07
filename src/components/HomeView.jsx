import React from 'react';
import { Gift, Gamepad2, ShoppingCart } from 'lucide-react';
import ProductCarousel from './ProductCarousel';

export default function HomeView({
  t,
  lang,
  products,
  searchQuery,
  selectedCategory,
  setSearchQuery,
  setSelectedCategory,
  onSelectProduct,
  addToCart
}) {
  const filteredProducts = products.filter(p => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = p.name_ar.toLowerCase().includes(query) || p.name_en.toLowerCase().includes(query);
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-12 animate-fade-in">
      <ProductCarousel products={products} lang={lang} onSelectProduct={onSelectProduct} />

      <div className="flex flex-wrap items-center gap-4 mb-8 justify-center">
        {[{id: 'all', name: t.all}, {id: 'games', name: t.games}, {id: 'cards', name: t.giftCards}].map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-8 py-3 rounded-xl font-bold transition-all ${selectedCategory === cat.id ? 'bg-cyan-500 text-slate-900 shadow-[0_0_20px_rgba(34,211,238,0.4)]' : 'bg-[#0a1329] text-slate-400 border border-slate-800 hover:border-cyan-500/50 hover:text-cyan-400'}`}>
            {cat.name}
          </button>
        ))}
      </div>

      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="bg-[#0a1329] rounded-2xl border border-slate-800 overflow-hidden hover:border-cyan-500/50 hover:shadow-[0_10px_30px_rgba(34,211,238,0.1)] transition-all duration-300 group flex flex-col cursor-pointer">
              <div className={`w-full h-40 relative bg-gradient-to-br ${product.color} flex items-center justify-center overflow-hidden`}>
                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                {product.icon === 'Gift' ? <Gift className="w-20 h-20 text-white drop-shadow-xl transform group-hover:scale-110 transition-transform duration-500" /> : <Gamepad2 className="w-20 h-20 text-white drop-shadow-xl transform group-hover:scale-110 transition-transform duration-500" />}
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between relative">
                <div>
                  <div className="text-xs font-bold text-cyan-500 mb-3 uppercase tracking-widest bg-cyan-500/10 inline-block px-2 py-1 rounded">
                    {lang === 'ar' ? (product.category === 'games' ? 'شحن ألعاب' : 'بطاقات رقمية') : product.category}
                  </div>
                  <h3 className="text-lg font-bold text-slate-100 mb-2 leading-snug">{lang === 'ar' ? product.name_ar : product.name_en}</h3>
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">${parseFloat(product.price).toFixed(2)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                    className="bg-slate-800/80 hover:bg-cyan-500 text-cyan-400 hover:text-slate-900 border border-cyan-900/50 p-3 rounded-xl font-bold transition-all shadow-lg">
                    <ShoppingCart className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
