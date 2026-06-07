import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function AdminView({ t, lang, products, createProduct, deleteProduct }) {
  const [newProduct, setNewProduct] = useState({
    name_en: '',
    name_ar: '',
    price: '',
    category: 'games',
    icon: 'Gamepad2',
    color: 'from-cyan-500 to-blue-600'
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    await createProduct(newProduct);
    setNewProduct({ name_en: '', name_ar: '', price: '', category: 'games', icon: 'Gamepad2', color: 'from-cyan-500 to-blue-600' });
  };

  return (
    <div className="max-w-6xl mx-auto mt-8 animate-fade-in grid grid-cols-1 xl:grid-cols-3 gap-8">
      <div className="xl:col-span-1 bg-[#0a1329] p-8 rounded-3xl border border-cyan-900/40 h-fit">
        <h3 className="text-xl font-bold text-white mb-8">{t.addNewProduct}</h3>
        <form onSubmit={handleAdd} className="space-y-5">
          <input required placeholder={t.productNameAr} value={newProduct.name_ar} onChange={e => setNewProduct({ ...newProduct, name_ar: e.target.value })} className="w-full bg-[#060b19] border border-slate-700 rounded-xl px-4 py-3 text-white" />
          <input required placeholder={t.productNameEn} value={newProduct.name_en} onChange={e => setNewProduct({ ...newProduct, name_en: e.target.value })} className="w-full bg-[#060b19] border border-slate-700 rounded-xl px-4 py-3 text-white" />
          <input required type="number" step="0.01" placeholder={t.price} value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} className="w-full bg-[#060b19] border border-slate-700 rounded-xl px-4 py-3 text-white" />
          <select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value, icon: e.target.value === 'games' ? 'Gamepad2' : 'Gift' })} className="w-full bg-[#060b19] border border-slate-700 rounded-xl px-4 py-3 text-white">
            <option value="games">Games</option>
            <option value="cards">Gift Cards</option>
          </select>
          <button type="submit" className="w-full bg-cyan-600 text-white py-4 rounded-xl font-bold">{t.add}</button>
        </form>
      </div>

      <div className="xl:col-span-2 bg-[#0a1329] p-8 rounded-3xl border border-slate-800">
        <table className="w-full text-left text-white">
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-b border-slate-800/50">
                <td className="py-4 font-bold">{lang === 'ar' ? p.name_ar : p.name_en}</td>
                <td className="py-4 text-cyan-500">${p.price}</td>
                <td className="py-4 text-center">
                  <button onClick={() => deleteProduct(p.id)} className="p-2 text-slate-500 hover:text-red-500"><Trash2 className="w-5 h-5 mx-auto" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
