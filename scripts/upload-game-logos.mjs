#!/usr/bin/env node
/**
 * Upload bundled game logos/covers to Supabase Storage and attach them to
 * catalog games whose slugs/names match the G2Bulk API naming.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-game-logos.mjs
 *   npm run upload:game-logos
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const path = join(root, '.env');
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function contentType(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function normalize(value = '') {
  return String(value).trim().toLowerCase();
}

function gameMatches(entry, game) {
  const slug = normalize(game.slug);
  const name = normalize(game.name_en);
  const match = entry.match || {};

  if (match.slugs?.some((value) => slug === normalize(value))) return true;
  if (match.slugPrefixes?.some((value) => slug.startsWith(normalize(value)))) return true;
  if (match.slugIncludes?.some((value) => slug.includes(normalize(value)))) return true;
  if (match.nameIncludes?.some((value) => name.includes(normalize(value)))) return true;
  return false;
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL in .env');
  }
  if (!serviceRole) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (required for storage upload + game updates)');
  }

  const manifest = JSON.parse(readFileSync(join(__dirname, 'game-logos.manifest.json'), 'utf8'));
  const bucket = manifest.bucket || 'product-images';
  const supabase = createClient(supabaseUrl, serviceRole);

  const uploaded = [];

  for (const entry of manifest.logos) {
    const sourcePath = join(root, entry.source);
    if (!existsSync(sourcePath)) {
      console.warn(`Skip missing file: ${entry.source}`);
      continue;
    }

    const bytes = readFileSync(sourcePath);
    const names = [entry.storageName, ...(entry.extraStorageNames || [])].filter(Boolean);

    for (const storageName of names) {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(storageName, bytes, {
          upsert: true,
          contentType: contentType(storageName),
          cacheControl: '31536000',
        });

      if (error) {
        throw new Error(`Upload failed for ${storageName}: ${error.message}`);
      }

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storageName);
      uploaded.push({
        storageName,
        publicUrl,
        kind: entry.kind || 'logo',
        entry,
      });
      console.log(`Uploaded ${entry.source} -> ${storageName}`);
    }
  }

  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id, slug, name_en, logo_url, image_url, parent_game_id');

  if (gamesError) throw gamesError;

  const logoEntries = manifest.logos.filter((entry) => (entry.kind || 'logo') === 'logo');
  const coverEntries = manifest.logos.filter((entry) => entry.kind === 'cover');

  let logoUpdates = 0;
  let coverUpdates = 0;

  for (const game of games || []) {
    for (const entry of logoEntries) {
      if (!gameMatches(entry, game)) continue;
      const publicUrl = uploaded.find((row) => row.storageName === entry.storageName)?.publicUrl;
      if (!publicUrl) continue;
      if (game.logo_url === publicUrl) continue;

      const { error } = await supabase
        .from('games')
        .update({ logo_url: publicUrl })
        .eq('id', game.id);

      if (error) throw error;
      logoUpdates += 1;
      console.log(`Logo -> ${game.slug}`);
      break;
    }

    for (const entry of coverEntries) {
      if (!gameMatches(entry, game)) continue;
      const publicUrl = uploaded.find((row) => row.storageName === entry.storageName)?.publicUrl;
      if (!publicUrl) continue;
      if (game.image_url === publicUrl) continue;

      const { error } = await supabase
        .from('games')
        .update({ image_url: publicUrl })
        .eq('id', game.id);

      if (error) throw error;
      coverUpdates += 1;
      console.log(`Cover -> ${game.slug}`);
      break;
    }
  }

  console.log('\nDone.');
  console.log(`Uploaded files: ${uploaded.length}`);
  console.log(`Logo updates: ${logoUpdates}`);
  console.log(`Cover updates: ${coverUpdates}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});