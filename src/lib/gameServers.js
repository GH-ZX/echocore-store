import {
  getEffectiveTopupFields,
  parseTopupFieldRequirements,
} from './gameTopupFields';

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

/**
 * Server options for the checkout UI.
 * When G2Bulk fields are known and do not include server, return [] even if
 * stale servers were left on the game row.
 */
export function getGameServerOptions(game, topupMeta = null) {
  const fields = getEffectiveTopupFields(game, topupMeta);
  if (fields.length > 0 && !parseTopupFieldRequirements(fields).needsServer) {
    return [];
  }

  const runtimeServers = normalizeGameServers(topupMeta?.servers);
  if (runtimeServers.length > 0) return runtimeServers;
  return normalizeGameServers(game?.servers);
}

/** Default server_id when the customer leaves the field empty — region from synced catalog. */
export function getDefaultGameServerId(game, topupMeta = null) {
  if (!gameShowsServerField(game, topupMeta)) return '';

  const region = String(game?.region_label || '').trim();
  const options = getGameServerOptions(game, topupMeta);

  if (region && region !== 'Global') {
    const regionMatch = options.find((row) => row.id === region || row.label === region);
    if (regionMatch) return regionMatch.id;
    // Only use free-text region when server is required but no option list exists
    if (options.length === 0) return region;
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

/**
 * Show server input only when the game actually requires it.
 *
 * Source of truth (in order):
 * 1. G2Bulk /games/fields (live topupMeta.fields or synced game.topup_fields)
 * 2. Explicit requiresServer from live meta after a successful fetch
 * 3. Non-empty server list (dropdown/text needed)
 *
 * Never force server for every G2Bulk UID game — PUBG only needs userid.
 */
export function gameShowsServerField(game, topupMeta = null) {
  if (!game) return false;

  const fields = getEffectiveTopupFields(game, topupMeta);
  if (fields.length > 0) {
    return parseTopupFieldRequirements(fields).needsServer;
  }

  // Live meta loaded with empty fields → trust requiresServer flag from API
  if (topupMeta && topupMeta.loading === false && Array.isArray(topupMeta.fields)) {
    if (topupMeta.requiresServer === true) return true;
    if (topupMeta.requiresServer === false) {
      // Still allow server list if G2Bulk returned servers (fields call may have failed)
      return getGameServerOptions(game, topupMeta).length > 0;
    }
  }

  // Unknown requirements: only show when we have something to select/enter
  return getGameServerOptions(game, topupMeta).length > 0;
}

export function gameUsesServerDropdown(game, topupMeta = null) {
  return getGameServerOptions(game, topupMeta).length > 1;
}

export function resolvePlayerServerForOrder(game, input = '', topupMeta = null) {
  if (!gameShowsServerField(game, topupMeta)) return null;
  const trimmed = String(input ?? '').trim();
  if (trimmed) return trimmed;
  const fallback = getDefaultGameServerId(game, topupMeta);
  return fallback || null;
}
