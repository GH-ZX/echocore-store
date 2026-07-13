/** Normalize game.servers from DB (strings or { id, label } objects). */
export function normalizeGameServers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry === 'string') {
      const value = entry.trim();
      return value ? { id: value, label: value } : null;
    }
    if (entry && typeof entry === 'object') {
      const id = String(entry.id ?? entry.value ?? entry.label ?? '').trim();
      const label = String(entry.label ?? entry.name ?? id).trim();
      if (!id) return null;
      return { id, label };
    }
    return null;
  }).filter(Boolean);
}

export function getGameServerOptions(game) {
  return normalizeGameServers(game?.servers);
}

/** Default server_id when the customer leaves the field empty — region from synced catalog. */
export function getDefaultGameServerId(game) {
  const region = String(game?.region_label || '').trim();
  const options = getGameServerOptions(game);

  if (region && region !== 'Global') {
    const regionMatch = options.find((row) => row.id === region || row.label === region);
    if (regionMatch) return regionMatch.id;
    return region;
  }

  if (options.length === 1) return options[0].id;
  return options[0]?.id || '';
}

/** Placeholder for the server field — shows catalog default without filling the value. */
export function getServerFieldPlaceholder(game, t = {}) {
  const defaultId = getDefaultGameServerId(game);
  if (!defaultId) return t.serverPlaceholder || '';
  const options = getGameServerOptions(game);
  const match = options.find((row) => row.id === defaultId);
  return match?.label || defaultId;
}

export function gameShowsServerField(game) {
  if (!game) return false;
  const options = getGameServerOptions(game);
  if (options.length > 0) return true;
  const region = String(game.region_label || '').trim();
  if (region && region !== 'Global') return true;
  const needsUid = game.redemption_method === 'uid' || game.redemption_method === 'both';
  return needsUid && game.catalog_source === 'g2bulk';
}

export function resolvePlayerServerForOrder(game, input = '') {
  const trimmed = String(input ?? '').trim();
  if (trimmed) return trimmed;
  const fallback = getDefaultGameServerId(game);
  return fallback || null;
}