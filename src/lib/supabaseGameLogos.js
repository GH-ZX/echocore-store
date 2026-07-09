import manifest from '../../scripts/game-logos.manifest.json';

const STORAGE_BUCKET = manifest.bucket || 'product-images';

function normalize(value = '') {
  return String(value).trim().toLowerCase();
}

function getPublicStorageBase() {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${STORAGE_BUCKET}`;
}

function gameMatches(entry, game) {
  const slug = normalize(game?.slug);
  const name = normalize(game?.name_en);
  const match = entry.match || {};

  if (match.slugs?.some((value) => slug === normalize(value))) return true;
  if (match.slugPrefixes?.some((value) => slug.startsWith(normalize(value)))) return true;
  if (match.slugIncludes?.some((value) => slug.includes(normalize(value)))) return true;
  if (match.nameIncludes?.some((value) => name.includes(normalize(value)))) return true;
  return false;
}

/** Resolve a Supabase-hosted logo URL from the bundled manifest + game slug/name. */
export function resolveSupabaseGameLogo(game, games = []) {
  const storageBase = getPublicStorageBase();
  if (!storageBase || !game) return null;

  const logoEntries = manifest.logos.filter((entry) => (entry.kind || 'logo') === 'logo');

  for (const entry of logoEntries) {
    if (gameMatches(entry, game)) {
      return `${storageBase}/${entry.storageName}`;
    }
  }

  if (game.parent_game_id) {
    const parent = games.find((row) => row.id === game.parent_game_id);
    if (parent) {
      const parentLogo = resolveSupabaseGameLogo(parent, games);
      if (parentLogo) return parentLogo;
    }
  }

  const slug = normalize(game.slug);
  if (slug) {
    return `${storageBase}/${slug}-logo.png`;
  }

  return null;
}