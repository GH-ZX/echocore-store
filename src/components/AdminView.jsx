import React, { useState, useEffect } from 'react';
import { Trash2, Upload, Link as LinkIcon, Plus, BarChart3, Package, ShoppingCart, RefreshCw, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminView({ 
  t, 
  lang, 
  games = [],
  offers = [],
  orders = [], 
  loadingOrders = false,
  createProduct, 
  updateProduct,
  deleteProduct,
  updateGame,
  refreshProducts,
  refreshOffers,
  refreshOrders 
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [newProduct, setNewProduct] = useState({
    game_id: '',
    name_en: '',
    name_ar: '',
    price: '',
    region: '',
    image_url: '',
    description_en: '',
    description_ar: '',
    sale_image_url: '',
    is_sale: false,
    original_price: ''
  });
  const [coverFile, setCoverFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saleCoverFile, setSaleCoverFile] = useState(null);

  // Editing state
  const [editingId, setEditingId] = useState(null);

  const [productFormError, setProductFormError] = useState('');
  const [productFormSuccess, setProductFormSuccess] = useState('');

  const [gameFormError, setGameFormError] = useState('');
  const [gameFormSuccess, setGameFormSuccess] = useState('');

  // For adding new games
  const [newGame, setNewGame] = useState({
    name_en: '',
    slug: '',
    points_name: '',
    logo_url: '',
    image_url: '',
    redemption_method: 'both',
    servers: [],   // admin-defined list of servers/regions (e.g. Europe, Turkey, Global)
    description_en: '',
    description_ar: ''
  });
  const [gameCoverFile, setGameCoverFile] = useState(null);
  const [gameLogoFile, setGameLogoFile] = useState(null);
  const [gameUploading, setGameUploading] = useState(false);

  // Game editing
  const [editingGameId, setEditingGameId] = useState(null);

  // Filter offers list by game
  const [filterGameId, setFilterGameId] = useState('');

  // Orders expandable
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  // Quick lookup for game names in offers list
  const gamesMap = Object.fromEntries(games.map(g => [g.id, g]));

  // Server selection for games (predefined choices - no free typing)
  const toggleGameServer = (srv) => {
    setNewGame(prev => {
      const current = Array.isArray(prev.servers) ? prev.servers : [];
      const isSelected = current.includes(srv);
      const newServers = isSelected
        ? current.filter(s => s !== srv)
        : [...current, srv];
      return { ...prev, servers: newServers };
    });
  };

  const filteredOffersForList = filterGameId 
    ? offers.filter(o => o.game_id === filterGameId) 
    : offers;

  // Upload helper
  const uploadImage = async (file, prefix = 'product') => {
    if (!file) return null;
    const fileExt = file.name.split('.').pop();
    const fileName = `${prefix}-${Date.now()}.${fileExt}`;

    setUploading(true);
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, file, { upsert: true });

    setUploading(false);

    if (error) {
      alert(t.imageUploadFailed || ('Image upload failed: ' + error.message + '\nMake sure storage policies allow authenticated uploads.\n\nRun fix_sale_upload_rls.sql (or full schema_games_offers.sql) in Supabase SQL editor.'));
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleAddGame = async (e) => {
    e.preventDefault();
    setGameFormError('');
    setGameFormSuccess('');
    if (!newGame.name_en || !newGame.slug) {
      setGameFormError(t.gameNameAndSlugRequired);
      return;
    }

    let finalLogo = newGame.logo_url;
    let finalImage = newGame.image_url;

    try {
      if (gameLogoFile) {
        setGameUploading(true);
        const uploadedLogo = await uploadImage(gameLogoFile, 'game-logo');
        setGameUploading(false);
        if (uploadedLogo) finalLogo = uploadedLogo;
      }
      if (gameCoverFile) {
        setGameUploading(true);
        const uploaded = await uploadImage(gameCoverFile, 'game-cover');
        setGameUploading(false);
        if (uploaded) finalImage = uploaded;
      }

      const gameData = {
        name_en: newGame.name_en.trim(),
        name_ar: newGame.name_en.trim(),
        slug: newGame.slug,
        points_name: newGame.points_name || 'Points',
        logo_url: finalLogo || null,
        image_url: finalImage || null,
        redemption_method: newGame.redemption_method || 'both',
        servers: Array.isArray(newGame.servers) ? newGame.servers : [],
        description_en: newGame.description_en || '',
        description_ar: newGame.description_ar || newGame.description_en || '',
        active: true
      };

      if (editingGameId) {
        // Update existing game
        if (updateGame) {
          await updateGame({ ...gameData, id: editingGameId });
        } else {
          const { error } = await supabase
            .from('games')
            .update(gameData)
            .eq('id', editingGameId);
          if (error) throw error;
        }
        setGameFormSuccess(t.gameUpdatedSuccess);
      } else {
        // Insert new game
        const { error } = await supabase
          .from('games')
          .insert(gameData);

        if (error) {
          console.error('Add game error:', error);
          setGameFormError(t.failedToAddGame + ': ' + error.message);
          return;
        }

        // Auto-select the new game in the offer form
        const { data: newG } = await supabase
          .from('games')
          .select('id')
          .eq('slug', gameData.slug)
          .limit(1);

        if (newG && newG[0]) {
          setNewProduct(prev => ({ ...prev, game_id: newG[0].id }));
        }

        setGameFormSuccess(t.gameAddedSelectOffer);
      }

      // Reset form
      setNewGame({ name_en: '', slug: '', points_name: '', logo_url: '', image_url: '', redemption_method: 'both', servers: [], description_en: '', description_ar: '' });
      setGameLogoFile(null);
      setGameCoverFile(null);
      setEditingGameId(null);
      if (refreshProducts) await refreshProducts();
      if (refreshOffers) await refreshOffers();
    } catch (err) {
      setGameUploading(false);
      console.error(err);
      setGameFormError(t.failedToSaveGame);
    }
  };

  const deleteGame = async (gameId) => {
    if (!confirm(t.deleteGameConfirm)) return;
    const { error } = await supabase.from('games').delete().eq('id', gameId);
    if (error) {
      console.error('Delete game error:', error);
      alert(t.failedToDeleteGame + ': ' + error.message);
      return;
    }
    if (refreshProducts) await refreshProducts();
    if (refreshOffers) await refreshOffers();
  };

  const startEditGame = (game) => {
    setEditingGameId(game.id);
    setNewGame({
      name_en: game.name_en || '',
      slug: game.slug || '',
      points_name: game.points_name || '',
      logo_url: game.logo_url || '',
      image_url: game.image_url || '',
      redemption_method: game.redemption_method || 'both',
      servers: Array.isArray(game.servers) ? game.servers : [],
      description_en: game.description_en || '',
      description_ar: game.description_ar || ''
    });
    setGameLogoFile(null);
    setGameCoverFile(null);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditGame = () => {
    setEditingGameId(null);
    setNewGame({ name_en: '', slug: '', points_name: '', logo_url: '', image_url: '', redemption_method: 'both', servers: [], description_en: '', description_ar: '' });
    setGameLogoFile(null);
    setGameCoverFile(null);
    setGameFormError('');
    setGameFormSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProductFormError('');
    if (!newProduct.name_en || !newProduct.price || !newProduct.game_id) {
      setProductFormError(t.gameNameEnglishAndPriceRequired);
      return;
    }
    if (newProduct.is_sale && !newProduct.original_price) {
      setProductFormError(t.originalPriceRequiredForSale);
      return;
    }

    const desc = (newProduct.description_en || '').trim();

    try {
      // Handle sale photo upload
      let finalSaleImage = newProduct.sale_image_url;
      if (saleCoverFile) {
        const uploaded = await uploadImage(saleCoverFile, 'sale');
        if (uploaded) finalSaleImage = uploaded;
      }

      // Offers do not use main image or amount. One description used for both languages.
      // Optional sale_image_url for dedicated sale offer cards.
      const productData = {
        game_id: newProduct.game_id,
        name_en: newProduct.name_en.trim(),
        name_ar: (newProduct.name_ar || newProduct.name_en).trim(),
        price: newProduct.price,
        region: newProduct.region || null,
        amount: null,
        image_url: null,
        description_en: desc,
        description_ar: desc,
        sale_image_url: finalSaleImage || null,
        is_sale: !!newProduct.is_sale,
        original_price: newProduct.is_sale ? (parseFloat(newProduct.original_price) || null) : null
      };

      if (editingId) {
        await updateProduct({ ...productData, id: editingId });
      } else {
        await createProduct(productData);
      }

      // reset form + files + editing
      resetForm();
      if (refreshProducts) await refreshProducts();

      setProductFormSuccess(editingId ? t.offerUpdatedSuccess : t.offerAddedSuccess);
      setTimeout(() => setProductFormSuccess(''), 2500);
    } catch (err) {
      console.error('Product save error:', err);
      setProductFormError(err.message || t.failedToSaveOffer || 'Failed to save offer. Check console or RLS policies.');
    }
  };

  const resetForm = () => {
    setNewProduct({
      game_id: '',
      name_en: '', name_ar: '', price: '', region: '',
      image_url: '', description_en: '', description_ar: '',
      sale_image_url: '',
      is_sale: false,
      original_price: ''
    });
    setCoverFile(null);
    setSaleCoverFile(null);
    setEditingId(null);
    setProductFormError('');
    setProductFormSuccess('');
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setNewProduct({
      game_id: product.game_id || '',
      name_en: product.name_en || '',
      name_ar: product.name_ar || '',
      price: product.price || '',
      region: product.region || '',
      image_url: product.image_url || '',
      description_en: product.description_en || product.description_ar || '',
      description_ar: product.description_ar || product.description_en || '',
      sale_image_url: product.sale_image_url || '',
      is_sale: !!product.is_sale,
      original_price: product.original_price || ''
    });
    setCoverFile(null);
    setSaleCoverFile(null);
    // Scroll to form or switch tab if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Calculate stats
  const totalProducts = offers.length;
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0).toFixed(2);
  const recentOrders = [...orders].slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto mt-6 animate-fade-in">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black">{t.adminDashboard}</h1>
          <p className="text-[var(--text-sec)]">{t.manageYourStore}</p>
        </div>
        <div className="flex gap-2">
          {refreshProducts && (
            <button onClick={refreshProducts} className="btn btn-secondary flex items-center gap-2 text-sm" title={t.refresh}>
              <RefreshCw className="w-4 h-4" /> {t.refresh}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] mb-6">
        {[
          { id: 'overview', label: t.overview, icon: BarChart3 },
          { id: 'products', label: t.gamesAndOffers, icon: Package },
          { id: 'orders', label: t.ordersTab, icon: ShoppingCart }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 font-bold border-b-2 transition-all ${isActive 
                ? 'border-[var(--accent)] text-[var(--accent)]' 
                : 'border-transparent text-[var(--text-sec)] hover:text-white'}`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.totalOffers}</div>
                  <div className="text-4xl font-black mt-1">{totalProducts}</div>
                </div>
                <Package className="w-10 h-10 text-[var(--accent)] opacity-70" />
              </div>
            </div>

            <div className="card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.totalOrders}</div>
                  <div className="text-4xl font-black mt-1">{totalOrders}</div>
                </div>
                <ShoppingCart className="w-10 h-10 text-[var(--accent)] opacity-70" />
              </div>
            </div>

            <div className="card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.totalRevenue}</div>
                  <div className="text-4xl font-black mt-1 text-emerald-400">${totalRevenue}</div>
                </div>
                <BarChart3 className="w-10 h-10 text-emerald-400 opacity-70" />
              </div>
            </div>

            <div className="card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.avgOrderValue}</div>
                  <div className="text-4xl font-black mt-1">
                    ${totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : '0.00'}
                  </div>
                </div>
                <Plus className="w-10 h-10 text-[var(--accent)] opacity-70" />
              </div>
            </div>
          </div>

          {/* Recent Orders */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-xl">{t.recentOrders}</h3>
                <p className="text-xs text-[var(--text-muted)]">{t.last5Orders}</p>
              </div>
              <button onClick={() => setActiveTab('orders')} className="text-sm text-[var(--accent)] hover:underline">View All →</button>
            </div>

            {loadingOrders ? (
              <div className="text-[var(--text-sec)]">{t.loadingOrders}</div>
            ) : recentOrders.length === 0 ? (
              <div className="text-[var(--text-sec)] py-8 text-center">{t.noOrdersYet}</div>
            ) : (
              <div className="space-y-3">
                {recentOrders.map(order => {
                  const customer = order.profiles?.name || (order.user_id ? `User ${order.user_id.slice(0, 6)}` : 'Unknown');
                  return (
                    <div 
                      key={order.id} 
                      onClick={() => {
                        setActiveTab('orders');
                        setExpandedOrderId(order.id);
                      }}
                      className="flex justify-between items-center p-3 bg-[var(--bg-primary)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/30 cursor-pointer"
                    >
                      <div>
                        <div className="font-mono text-xs text-[var(--text-muted)]">#{order.id.slice(0,8)}</div>
                        <div className="text-sm">{customer}</div>
                        <div className="text-xs text-[var(--text-muted)]">{new Date(order.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">${parseFloat(order.total || 0).toFixed(2)}</div>
                        <div className="text-xs text-[var(--text-sec)]">{order.payment_method || 'N/A'} • {(order.order_items?.length || 0)} items</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <div className="space-y-8">
          {/* GAMES MANAGEMENT (like offers sector) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add / Edit Game Form */}
            <div className="lg:col-span-1 card p-6 h-fit">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-5 h-5 text-[var(--accent)]" />
                <h3 className="text-xl font-bold">{editingGameId ? t.editGame : t.addNewGame}</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)] -mt-2 mb-3">{t.addOffersBelow}</p>

              <form onSubmit={handleAddGame} className="space-y-4">
                <input 
                  placeholder={t.gameNameEnglish} 
                  value={newGame.name_en} 
                  onChange={e => {
                    const val = e.target.value;
                    if (editingGameId) {
                      setNewGame({ ...newGame, name_en: val });
                    } else {
                      setNewGame({ ...newGame, name_en: val, slug: val.toLowerCase().replace(/\s+/g, '-') });
                    }
                  }} 
                  className="input" 
                  required 
                />
                <input 
                  placeholder={t.slug} 
                  value={newGame.slug} 
                  onChange={e => setNewGame({ ...newGame, slug: e.target.value })} 
                  className="input" 
                />
                <p className="text-[10px] text-[var(--text-muted)] -mt-2">{t.slugHelp}</p>
                <input 
                  placeholder={t.pointsName} 
                  value={newGame.points_name} 
                  onChange={e => setNewGame({ ...newGame, points_name: e.target.value })} 
                  className="input" 
                />

                <input 
                  placeholder={t.descriptionEnglish} 
                  value={newGame.description_en || ''} 
                  onChange={e => setNewGame({ ...newGame, description_en: e.target.value })} 
                  className="input" 
                />
                <input 
                  placeholder={t.descriptionArabic} 
                  value={newGame.description_ar || ''} 
                  onChange={e => setNewGame({ ...newGame, description_ar: e.target.value })} 
                  className="input" 
                />

                <div>
                  <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.redemptionMethod || 'Redemption Method'}</label>
                  <select 
                    value={newGame.redemption_method} 
                    onChange={e => setNewGame({ ...newGame, redemption_method: e.target.value })} 
                    className="input w-full"
                  >
                    <option value="uid">{t.redemptionUid || 'UID only'}</option>
                    <option value="redeem_code">{t.redemptionCode || 'Redeem Code only'}</option>
                    <option value="both">{t.redemptionBoth || 'Both'}</option>
                  </select>
                </div>

                {/* Servers / Regions - Select from predefined options (no free typing) */}
                <div>
                  <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block">
                    {t.availableServers || 'Available Servers / Regions'}
                  </label>

                  {(() => {
                    const serverList = (t.serverOptions && t.serverOptions.length > 0)
                      ? t.serverOptions
                      : ["Global", "Europe", "Turkey", "Korea", "North America", "Southeast Asia", "Latin America", "Middle East", "Japan", "India", "Russia", "China", "Oceania", "Brazil"];
                    const currentServers = Array.isArray(newGame.servers) ? newGame.servers : [];

                    return (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {serverList.map((srv) => {
                            const isSelected = currentServers.includes(srv);
                            return (
                              <button
                                key={srv}
                                type="button"
                                onClick={() => toggleGameServer(srv)}
                                className={`px-3 py-2 text-xs rounded-xl border transition-all text-left flex items-center gap-2
                                  ${isSelected 
                                    ? 'bg-[var(--accent)] text-[#040812] border-[var(--accent)] font-semibold' 
                                    : 'bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10'
                                  }`}
                              >
                                <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-[#040812]' : 'bg-[var(--text-muted)]'}`}></span>
                                {srv}
                              </button>
                            );
                          })}
                        </div>

                        {currentServers.length > 0 && (
                          <div className="mt-3 text-xs">
                            <span className="text-[var(--text-muted)] mr-2">Selected:</span>
                            <span className="font-medium text-[var(--accent)]">{currentServers.join(' • ')}</span>
                          </div>
                        )}

                        {currentServers.length === 0 && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            No servers selected. Users will see a free text field for server when buying.
                          </p>
                        )}
                      </>
                    );
                  })()}

                  <p className="text-[10px] text-[var(--text-muted)] mt-2">
                    {lang === 'ar' 
                      ? 'اختر السيرفرات المتاحة لهذه اللعبة. المستخدم سيختار من هذه القائمة عند الشراء (للألعاب التي تحتاج UID).' 
                      : 'Select the available servers for this game. Users will pick from this list on the purchase page (for games that need UID).'}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block flex items-center gap-1">
                    <Upload className="w-3 h-3" /> {t.logoForCarousel}
                  </label>
                  <div className="flex flex-col gap-2">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={e => setGameLogoFile(e.target.files?.[0] || null)} 
                      className="input flex-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[var(--accent)] file:text-[#040812]" 
                    />
                    <input 
                      placeholder={t.orPasteLogoURL} 
                      value={newGame.logo_url || ''} 
                      onChange={e => setNewGame({ ...newGame, logo_url: e.target.value })} 
                      className="input flex-1 text-sm" 
                    />
                  </div>
                  {gameLogoFile && <div className="text-xs text-emerald-400 mt-1">{t.willUploadLogo}: {gameLogoFile.name}</div>}
                  {newGame.logo_url && !gameLogoFile && (
                    <img src={newGame.logo_url} alt={t.preview} className="mt-2 h-10 object-contain" />
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block flex items-center gap-1">
                    <Upload className="w-3 h-3" /> {t.coverPhoto}
                  </label>
                  <div className="flex flex-col gap-2">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={e => setGameCoverFile(e.target.files?.[0] || null)} 
                      className="input flex-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[var(--accent)] file:text-[#040812]" 
                    />
                    <input 
                      placeholder={t.orPasteCoverURL} 
                      value={newGame.image_url || ''} 
                      onChange={e => setNewGame({ ...newGame, image_url: e.target.value })} 
                      className="input flex-1 text-sm" 
                    />
                  </div>
                  {gameCoverFile && <div className="text-xs text-emerald-400 mt-1">{t.willUploadCover}: {gameCoverFile.name}</div>}
                  {newGame.image_url && !gameCoverFile && (
                    <img src={newGame.image_url} alt={t.preview} className="mt-2 h-16 w-auto object-cover rounded border" />
                  )}
                </div>

                {gameFormError && (
                  <div className="bg-red-500/10 border border-red-500/60 text-red-400 p-2 rounded text-xs">
                    {gameFormError}
                  </div>
                )}
                {gameFormSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/60 text-emerald-400 p-2 rounded text-xs">
                    {gameFormSuccess}
                  </div>
                )}

                <div className="flex gap-2">
                  <button 
                    type="submit" 
                    disabled={gameUploading} 
                    className="btn btn-primary py-3 flex-1"
                  >
                    {gameUploading ? t.uploading : (editingGameId ? t.updateGameBtn : t.addNewGameBtn)}
                  </button>
                  {editingGameId && (
                    <button 
                      type="button" 
                      onClick={cancelEditGame} 
                      className="btn btn-secondary px-6"
                    >
                      {t.cancel}
                    </button>
                  )}
                </div>
              </form>
              <p className="text-xs text-[var(--text-muted)] mt-3">{t.englishNameOnlyHelp || 'English name only. Logo appears at bottom of home carousel. Cover used for game cards. Edit existing games from the list below.'}</p>
            </div>

            {/* GAMES LIST */}
            <div className="lg:col-span-2 card p-6">
              <h4 className="font-bold mb-4">{t.existingGames} <span className="text-xs font-normal text-[var(--text-muted)]">({t.clickEditToUpdate})</span></h4>
              {games.length === 0 ? (
                <div className="text-[var(--text-sec)]">{t.noGamesYet}</div>
              ) : (
                <div className="space-y-2">
                  {games.map(g => (
                    <div key={g.id} className="flex justify-between items-center p-2 bg-[var(--bg-primary)] rounded hover:bg-[var(--bg-elevated)]">
                      <div className="flex items-center gap-2">
                        {g.logo_url && <img src={g.logo_url} alt="" className="h-6 w-6 object-contain rounded" onError={e=>e.target.style.display='none'} />}
                        <span>{lang === 'ar' ? g.name_ar : g.name_en} ({g.points_name}) — {g.redemption_method || 'both'}</span>
                        {Array.isArray(g.servers) && g.servers.length > 0 && (
                          <span className="text-[10px] ml-2 text-[var(--accent)]/80">{g.servers.join(' • ')}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEditGame(g)} className="p-1 text-[var(--accent)] hover:text-white" title={t.edit}>
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteGame(g.id)} className="p-1 text-red-400 hover:text-red-500" title={t.delete}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border)] my-4"></div>

          {/* OFFERS / PRODUCTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add / Upload Offer Form */}
            <div className="lg:col-span-1 card p-6 h-fit">
              <div className="flex items-center gap-2 mb-5">
                <Plus className="w-5 h-5 text-[var(--accent)]" />
                <h3 className="text-xl font-bold">{editingId ? t.editOffer : t.addNewOffer}</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)] -mt-2 mb-3">{t.addGamesAbove || 'Add new games using the section above.'}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input required placeholder={t.nameEnglish} value={newProduct.name_en} onChange={e => setNewProduct({ ...newProduct, name_en: e.target.value })} className="input" />
                <input placeholder={t.nameArabicOptional} value={newProduct.name_ar} onChange={e => setNewProduct({ ...newProduct, name_ar: e.target.value })} className="input" />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.selectGame || 'Game'}</label>
                <select 
                  required
                  value={newProduct.game_id || ''} 
                  onChange={e => setNewProduct({ ...newProduct, game_id: e.target.value })} 
                  className="input w-full"
                >
                  <option value="">{t.selectGame}</option>
                  {games.map(g => (
                    <option key={g.id} value={g.id}>
                      {lang === 'ar' ? g.name_ar : g.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input required type="number" step="0.01" placeholder={t.price} value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} className="input" />
                <input placeholder={t.regionOptional} value={newProduct.region || ''} onChange={e => setNewProduct({ ...newProduct, region: e.target.value })} className="input" />
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={!!newProduct.is_sale} 
                  onChange={e => setNewProduct({ ...newProduct, is_sale: e.target.checked, original_price: e.target.checked ? newProduct.original_price : '' })} 
                  className="accent-[var(--accent)]" 
                />
                <label className="text-xs font-semibold text-[var(--text-sec)]">{t.thisIsSaleOffer}</label>
              </div>

              {newProduct.is_sale && (
                <div>
                  <input 
                    required 
                    type="number" 
                    step="0.01" 
                    placeholder={t.originalPriceBeforeDiscount} 
                    value={newProduct.original_price || ''} 
                    onChange={e => setNewProduct({ ...newProduct, original_price: e.target.value })} 
                    className="input" 
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block">{t.descriptionOneEnough}</label>
                <textarea 
                  placeholder={t.descriptionOneEnough} 
                  value={newProduct.description_en} 
                  onChange={e => setNewProduct({ ...newProduct, description_en: e.target.value })} 
                  className="input w-full h-20 text-sm resize-y" 
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-sec)] mb-0.5 block">{t.salePhotoOptional}</label>
                <p className="text-[10px] text-[var(--text-muted)] -mt-1 mb-1.5">{t.salePhotoHelp}</p>
                <div className="flex flex-col gap-2">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => setSaleCoverFile(e.target.files?.[0] || null)} 
                    className="input flex-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[var(--accent)] file:text-[#040812]" 
                  />
                  <input 
                    placeholder={t.orPasteSalePhotoURL} 
                    value={newProduct.sale_image_url || ''} 
                    onChange={e => setNewProduct({ ...newProduct, sale_image_url: e.target.value })} 
                    className="input flex-1 text-sm" 
                  />
                </div>
                {saleCoverFile && <div className="text-xs text-emerald-400 mt-1">{t.willUploadSalePhoto}: {saleCoverFile.name}</div>}
                {newProduct.sale_image_url && !saleCoverFile && (
                  <img src={newProduct.sale_image_url} alt={t.preview} className="mt-2 h-16 w-auto object-cover rounded border" />
                )}
              </div>

              {productFormError && (
                <div className="bg-red-500/10 border border-red-500/60 text-red-400 p-2 rounded text-xs">
                  {productFormError}
                </div>
              )}
              {productFormSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/60 text-emerald-400 p-2 rounded text-xs">
                  {productFormSuccess}
                </div>
              )}

              <div className="flex gap-2">
                <button 
                  type="submit" 
                  disabled={uploading} 
                  className="btn btn-primary flex-1 py-3.5 disabled:opacity-60"
                >
                  {uploading ? t.uploading : (editingId ? t.updateOffer : t.addOffer)}
                </button>
                {editingId && (
                  <button 
                    type="button" 
                    onClick={resetForm} 
                    className="btn btn-secondary px-6"
                  >
                    {t.cancel}
                  </button>
                )}
              </div>
            </form>

            <p className="text-xs text-[var(--text-muted)] mt-4">
              {t.offersNeedOnly}
            </p>
          </div>

          {/* Offers List */}
          <div className="lg:col-span-2 card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="font-bold">{filteredOffersForList.length} {t.offersCount || 'Offers'}</span>
                {filterGameId && <span className="text-xs text-[var(--text-sec)] ml-2">{t.filtered}</span>}
              </div>
              <div className="flex items-center gap-2">
                <select 
                  value={filterGameId} 
                  onChange={e => setFilterGameId(e.target.value)}
                  className="input text-xs py-1"
                >
                  <option value="">{t.allGamesOption || 'All Games'}</option>
                  {games.map(g => (
                    <option key={g.id} value={g.id}>{lang === 'ar' ? g.name_ar : g.name_en}</option>
                  ))}
                </select>
                <button onClick={() => setActiveTab('overview')} className="text-xs text-[var(--accent)] hover:underline">{t.backToOverview || 'Back to Overview'}</button>
              </div>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
              {filteredOffersForList.length > 0 ? (
                filteredOffersForList.map(offer => {
                  const game = gamesMap[offer.game_id];
                  const img = offer.sale_image_url || offer.image_url;
                  return (
                    <div key={offer.id} className="flex items-center gap-4 p-3 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/40 group">
                      {img && (
                        <img 
                          src={img} 
                          alt="" 
                          className="w-12 h-12 object-cover rounded-xl flex-shrink-0 border border-[var(--border)]" 
                          onError={(e) => e.currentTarget.style.display = 'none'} 
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{lang === 'ar' ? offer.name_ar : offer.name_en}</div>
                        <div className="text-xs text-[var(--text-muted)] flex gap-2 flex-wrap">
                          {game && <span className="text-[var(--accent)]">{lang === 'ar' ? game.name_ar : game.name_en}</span>}
                          {offer.is_sale && offer.original_price ? (
                            <>
                              <span className="line-through">${parseFloat(offer.original_price).toFixed(2)}</span>
                              <span className="font-semibold text-red-400">${parseFloat(offer.price).toFixed(2)}</span>
                            </>
                          ) : (
                            <span>${parseFloat(offer.price).toFixed(2)}</span>
                          )}
                          {offer.is_sale && <span className="px-1 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px]">{t.sale}</span>}
                          {offer.amount && <span>{offer.amount} {game?.points_name}</span>}
                          {offer.region && <span>• {offer.region}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => startEdit(offer)} 
                          className="p-2 text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-xl"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm(t.deleteOfferConfirm)) deleteProduct(offer.id);
                          }} 
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-[var(--text-sec)]">{t.noOffersYetAddGame}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ORDERS TAB */}
      {activeTab === 'orders' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-xl">{t.ordersTab || 'Orders'} ({orders.length})</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.clickAnyRow || 'Click any row to see details and customer info'}</p>
            </div>
            {refreshOrders && <button onClick={refreshOrders} className="text-sm btn btn-secondary">Refresh</button>}
          </div>

          {loadingOrders ? (
            <div className="py-12 text-center text-[var(--text-sec)]">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center">
              <p>{t.noOrdersYet}</p>
              <p className="text-xs text-[var(--text-muted)] mt-2">Make sure you are logged in as admin, your profile has role='admin', and RLS policies for orders are applied.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-sec)] border-b border-[var(--border)]">
                    <th className="py-3 pr-4">{t.orderId || 'Order ID'}</th>
                    <th className="py-3 pr-4">{t.customer || 'Customer'}</th>
                    <th className="py-3 pr-4">{t.date || 'Date'}</th>
                    <th className="py-3 pr-4">{t.total || 'Total'}</th>
                    <th className="py-3 pr-4">{t.payment || 'Payment'}</th>
                    <th className="py-3 pr-4">{t.items || 'Items'}</th>
                    <th className="py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => {
                    const isExpanded = expandedOrderId === order.id;
                    const items = order.order_items || [];
                    const customer = order.profiles?.name || (order.user_id ? `User ${order.user_id.slice(0, 8)}` : 'Unknown');
                    return (
                      <React.Fragment key={order.id}>
                        <tr 
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} 
                          className="border-b border-[var(--border)] last:border-0 hover:bg-white/5 cursor-pointer"
                        >
                          <td className="py-3 pr-4 font-mono text-xs">{order.id.slice(0, 8)}...</td>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-sm">{customer}</div>
                            {order.user_id && (
                              <div className="font-mono text-[10px] text-[var(--text-muted)]">{order.user_id.slice(0, 8)}...</div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-xs">{new Date(order.created_at).toLocaleString()}</td>
                          <td className="py-3 pr-4 font-bold text-[var(--accent)]">${parseFloat(order.total || 0).toFixed(2)}</td>
                          <td className="py-3 pr-4 text-xs capitalize">{order.payment_method || '—'}</td>
                          <td className="py-3 pr-4 text-xs">
                            <span className="inline-block px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-sec)]">{items.length}</span>
                          </td>
                          <td className="py-3 text-right text-[var(--text-sec)]">
                            {isExpanded ? '−' : '+'}
                          </td>
                        </tr>

                        {/* Expanded details */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <div className="bg-[var(--bg-primary)] px-4 py-4 text-sm border-b border-[var(--border)]">
                                <div className="flex flex-wrap gap-x-8 gap-y-1 mb-3 text-xs">
                                  <div><span className="text-[var(--text-muted)]">{t.customerLabel || 'Customer:'}</span> <span className="font-medium">{customer}</span></div>
                                  <div><span className="text-[var(--text-muted)]">{t.statusLabel || 'Status:'}</span> <span className="capitalize text-emerald-400">{order.status || 'completed'}</span></div>
                                  <div><span className="text-[var(--text-muted)]">{t.payment || 'Payment:'}</span> <span className="capitalize">{order.payment_method || '—'}</span></div>
                                </div>

                                <div className="text-[var(--text-sec)] mb-2 text-xs font-semibold uppercase tracking-wider">{t.itemsLabel || 'Items'}</div>
                                <div className="space-y-1 pl-1">
                                  {items.length > 0 ? items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-xs py-0.5">
                                      <span>{item.name_snapshot}</span>
                                      <span className="font-mono text-[var(--accent)]">${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}</span>
                                    </div>
                                  )) : (
                                    <div className="text-[var(--text-muted)] text-xs">{t.noItemsRecorded || 'No items recorded'}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-center text-[var(--text-muted)] mt-8">
        {lang === 'ar' ? (t.allDataLiveAr || 'جميع البيانات مباشرة من Supabase • المسؤولون فقط يمكنهم الوصول إلى هذه اللوحة') : (t.allDataLive || 'All data is live from Supabase • Only admins can access this panel')}
      </div>
    </div>
  );
}

