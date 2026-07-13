import { parseTopupFieldRequirements } from './gameTopupFields';

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

export function getGameServerOptions(game, topupMeta = null) {
  const runtimeServers = normalizeGameServers(topupMeta?.servers);
  if (runtimeServers.length > 0) return runtimeServers;
  return normalizeGameServers(game?.servers);
}

/** Default server_id when the customer leaves the field empty — region from synced catalog. */
export function getDefaultGameServerId(game, topupMeta = null) {
  const region = String(game?.region_label || '').trim();
  const options = getGameServerOptions(game, topupMeta);

  if (region && region !== 'Global') {
    const regionMatch = options.find((row) => row.id === region || row.label === region);
    if (regionMatch) return regionMatch.id;
    return region;
  }

  if (options.length === 1) return options[0].id;
  return options[0]?.id || '';
}

/** Placeholder for the server field — shows catalog default without filling the value. */
export function getServerFieldPlaceholder(game, t = {}, topupMeta = null) {
  const defaultId = getDefaultGameServerId(game, topupMeta);
  if (!defaultId) return t.serverPlaceholder || '';
  const options = getGameServerOptions(game, topupMeta);
  const match = options.find((row) => row.id === defaultId);
  return match?.label || defaultId;
}

export function gameShowsServerField(game, topupMeta = null) {
  if (!game) return false;

  const options = getGameServerOptions(game, topupMeta);
  if (options.length > 0) return true;

  if (parseTopupFieldRequirements(topupMeta?.fields).needsServer) return true;

  const region = String(game.region_label || '').trim();
  if (region && region !== 'Global') return true;

  const needsUid = game.redemption_method === 'uid' || game.redemption_method === 'both';
  return needsUid && (game.catalog_source === 'g2bulk' || !!topupMeta?.requiresServer
    || parseTopupFieldRequirements(topupMeta?.fields).needsServer);
}

export function gameUsesServerDropdown(game, topupMeta = null) {
  return getGameServerOptions(game, topupMeta).length > 1;
}

export function resolvePlayerServerForOrder(game, input = '', topupMeta = null) {
  const trimmed = String(input ?? '').trim();
  if (trimmed) return trimmed;
  const fallback = getDefaultGameServerId(game, topupMeta);
  return fallback || null;
}