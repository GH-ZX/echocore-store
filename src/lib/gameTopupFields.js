export function normalizeTopupFieldToken(value = '') {
  return String(value).trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function parseTopupFieldRequirements(fields = []) {
  const tokens = (Array.isArray(fields) ? fields : [])
    .map(normalizeTopupFieldToken)
    .filter(Boolean);

  return {
    needsUid: tokens.some((token) => token === 'userid' || token === 'uid' || token === 'playerid'),
    needsServer: tokens.some((token) => token.includes('server')),
    needsCharname: tokens.some((token) => token.includes('charname') || token === 'character'),
  };
}

export function buildTopupMetaFlags(fields = []) {
  const reqs = parseTopupFieldRequirements(fields);
  return {
    requiresServer: reqs.needsServer,
    requiresCharname: reqs.needsCharname,
  };
}

/** Prefer live meta fields when present; otherwise synced game.topup_fields. */
export function getEffectiveTopupFields(game = null, topupMeta = null) {
  if (Array.isArray(topupMeta?.fields) && topupMeta.fields.length > 0) {
    return topupMeta.fields;
  }
  if (Array.isArray(game?.topup_fields) && game.topup_fields.length > 0) {
    return game.topup_fields;
  }
  return [];
}

export function getEffectiveTopupNotes(game = null, topupMeta = null) {
  const live = String(topupMeta?.notes || '').trim();
  if (live) return live;
  return String(game?.topup_notes || '').trim();
}

/** Seed checkout topupMeta from DB-synced game row (before live refresh). */
export function buildTopupMetaFromGame(game = null) {
  const fields = Array.isArray(game?.topup_fields) ? game.topup_fields : [];
  const servers = Array.isArray(game?.servers) ? game.servers : [];
  const notes = String(game?.topup_notes || '').trim();
  return {
    loading: false,
    fields,
    servers,
    notes,
    ...buildTopupMetaFlags(fields),
  };
}

export function gameShowsCharnameField(game = null, topupMeta = null) {
  return parseTopupFieldRequirements(getEffectiveTopupFields(game, topupMeta)).needsCharname;
}

export function isCharnameComplete(topupMeta, value = '', game = null) {
  if (!gameShowsCharnameField(game, topupMeta)) return true;
  return String(value).trim().length > 0;
}
