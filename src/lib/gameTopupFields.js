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

export function gameShowsCharnameField(_game, topupMeta = null) {
  return parseTopupFieldRequirements(topupMeta?.fields).needsCharname;
}

export function isCharnameComplete(topupMeta, value = '') {
  if (!gameShowsCharnameField(null, topupMeta)) return true;
  return String(value).trim().length > 0;
}