function addImage(items, seen, url, label, extra = {}) {
  const trimmed = String(url || '').trim();
  if (!trimmed || seen.has(trimmed)) return;
  seen.add(trimmed);
  items.push({ url: trimmed, label: label || trimmed, ...extra });
}

/** Images already used on the storefront (games + offers). */
export function collectSiteImages({ games = [], offers = [] } = {}) {
  const seen = new Set();
  const items = [];

  for (const game of games) {
    const name = game.name_en || game.name_ar || game.slug || 'Game';
    addImage(items, seen, game.logo_url, `${name} · logo`, { kind: 'logo' });
    addImage(items, seen, game.image_url, `${name} · cover`, { kind: 'cover' });
  }

  for (const offer of offers) {
    const name = offer.name_en || offer.name_ar || 'Offer';
    addImage(items, seen, offer.sale_image_url, `${name} · sale`, { kind: 'sale' });
  }

  return items;
}

/** Images from the G2Bulk pull catalog (live API snapshot). */
export function collectG2bulkCatalogImages(
  catalog = {},
  { gameCode = '', categoryId = null, includeAll = false } = {},
) {
  const seen = new Set();
  const items = [];
  const normalizedCode = String(gameCode || '').trim().toLowerCase();
  const numericCategoryId = Number(categoryId);

  for (const game of catalog.games || []) {
    const code = String(game.code || game.g2bulk_game_code || '').trim().toLowerCase();
    if (!includeAll && normalizedCode && code !== normalizedCode) continue;
    const name = game.name || game.name_en || code || 'Game';
    addImage(items, seen, game.image_url || game.logo_url, name, { source: 'g2bulk' });
  }

  const voucherRows = [...(catalog.accounts || []), ...(catalog.giftCards || [])];
  for (const row of voucherRows) {
    const cid = Number(row.categoryId);
    if (!includeAll && Number.isFinite(numericCategoryId) && cid !== numericCategoryId) continue;
    addImage(items, seen, row.image_url, row.title || `Category ${cid}`, { source: 'g2bulk' });
  }

  return items;
}