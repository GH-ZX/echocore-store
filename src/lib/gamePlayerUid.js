export function resolveGameUidStorageKey(game) {
  if (!game) return '';
  return String(game.id || '');
}

export function normalizeGamePlayerUids(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  return map;
}

export function getSavedGamePlayerEntry(gamePlayerUids, gameOrKey) {
  const map = normalizeGamePlayerUids(gamePlayerUids);
  const key = typeof gameOrKey === 'string'
    ? gameOrKey
    : resolveGameUidStorageKey(gameOrKey);

  if (!key) return { uid: '', server: '', charname: '' };

  const entry = map[key];
  if (!entry || typeof entry !== 'object') {
    return { uid: '', server: '', charname: '' };
  }

  return {
    uid: String(entry.uid || '').trim(),
    server: String(entry.server || '').trim(),
    charname: String(entry.charname || '').trim(),
  };
}

export function mergeGamePlayerUidIntoProfile(profile, game, {
  player_uid,
  player_server,
  player_charname,
} = {}) {
  if (!profile) return profile;

  const key = resolveGameUidStorageKey(game);
  const uid = String(player_uid || '').trim();
  if (!key || !uid) return profile;

  const prev = normalizeGamePlayerUids(profile.game_player_uids);
  const server = String(player_server || '').trim();
  const charname = String(player_charname || '').trim();

  return {
    ...profile,
    game_player_uids: {
      ...prev,
      [key]: {
        uid,
        ...(server ? { server } : {}),
        ...(charname ? { charname } : {}),
        updated_at: new Date().toISOString(),
      },
    },
  };
}