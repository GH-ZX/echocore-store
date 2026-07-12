/**
 * Merge supabase_*.sql migrations into supabase_echocore_full.sql (deduplicated).
 * Run: node scripts/merge-supabase-sql.mjs && node scripts/dedupe-full-sql.mjs
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const fullPath = path.join(root, 'supabase_echocore_full.sql');

const MIGRATION_ORDER = [
  'supabase_catalog_voucher_normalization_migration.sql',
  'supabase_moderation_migration.sql',
  'supabase_moderation_v2_migration.sql',
  'supabase_moderation_v3_user_auth_migration.sql',
  'supabase_username_migration.sql',
  'supabase_username_change_migration.sql',
  'supabase_admin_user_profile_fix.sql',
  'supabase_order_ref_migration.sql',
  'supabase_inbox_dismiss_migration.sql',
  'supabase_game_player_uids_migration.sql',
  'supabase_admin_gift_migration.sql',
  'supabase_syriatel_payment_migration.sql',
  'supabase_sam_invoice_recharge_migration.sql',
  'supabase_sam_invoice_orders_migration.sql',
];

const SKIP_APPEND = new Set([
  'supabase_charm_pricing_migration.sql',
  'supabase_sam_api_migration.sql',
  'supabase_username_gamer_style_migration.sql',
  'supabase_sam_api_clear_key_patch.sql',
]);

const POINTER = (section) => `-- =============================================================================
-- DEPRECATED: merged into supabase_echocore_full.sql (${section})
-- Run supabase_echocore_full.sql only — do not execute this file separately.
-- =============================================================================
`;

function stripMigrationPreamble(text) {
  return text
    .replace(/^-- ={5,}[\s\S]*?-- ={5,}\n+/m, '')
    .replace(/^-- (ECHOCORE|Run once|Run in Supabase)[\s\S]*?\n\n/im, '')
    .replace(/^-- Done\.[\s\S]*$/m, '')
    .trim();
}

function removeFunctionBlock(sql, fnName, { maxLen = 12000 } = {}) {
  const startRe = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'm');
  const m = startRe.exec(sql);
  if (!m) return sql;
  const start = m.index;
  const endMarker = '\nEND;\n$$;';
  const end = sql.indexOf(endMarker, start);
  if (end === -1 || end - start > maxLen) {
    console.warn(`Skip remove ${fnName}: end not found or block too large (${end - start})`);
    return sql;
  }
  return `${sql.slice(0, start)}-- (removed ${fnName}; canonical definition appended later)\n${sql.slice(end + endMarker.length)}`;
}

function patchCreateOrderAtomic(sql) {
  const authBlock = `  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;`;
  const mergedAuth = `${authBlock}

  IF public.is_admin() AND auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Admins cannot purchase for themselves';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(p_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;`;
  if (!sql.includes(authBlock) || sql.includes('Admins cannot purchase for themselves')) return sql;
  return sql.replace(authBlock, mergedAuth);
}

function updateHeader(text) {
  let out = text.replace(/-- Version: 0\.5\.0/, '-- Version: 0.6.0 (single merged file, no duplicate RPC bodies)');
  if (!out.includes('§17')) {
    out = out.replace(
      /--   Â§16  Sam API|--   §16  Sam API/,
      (m) => `${m} wallet (manual + API dual mode)\n--   §17–§27  Moderation, usernames, gifts, Syriatel, Sam invoices`,
    );
  }
  return out;
}

function findEndMarkerIndex(text) {
  const m = text.match(/-- ={5,}\r?\n-- END OF ECHOCORE SUPABASE SETUP/);
  if (!m || m.index == null) throw new Error('END marker not found');
  return m.index;
}

function applyCharmToBase(text) {
  if (text.includes('CREATE OR REPLACE FUNCTION public.save_g2bulk_settings')) {
    if (!text.includes('g2bulk_charm_pricing_enabled')) {
      text = text.replace(
        /(g2bulk_markup_percent = COALESCE\(p_markup_percent, 15\),)/,
        `$1\n    g2bulk_charm_pricing_enabled = COALESCE(p_charm_pricing_enabled, g2bulk_charm_pricing_enabled, false),`,
      );
    }
    return text;
  }
  const charm = fs.readFileSync(path.join(root, 'supabase_charm_pricing_migration.sql'), 'utf8');
  return `${text.trimEnd()}\n\n-- =============================================================================\n-- §11b Charm pricing toggle\n-- =============================================================================\n\n${stripMigrationPreamble(charm)}\n`;
}

let full = fs.readFileSync(fullPath, 'utf8');
full = updateHeader(full);
full = applyCharmToBase(full);

// Strip stale §06 create_order_atomic — canonical version is appended in §27
full = removeFunctionBlock(full, 'create_order_atomic');

const appendParts = [];
let canonicalOrder = '';

for (const file of MIGRATION_ORDER) {
  const fp = path.join(root, file);
  if (!fs.existsSync(fp)) throw new Error(`Missing ${file}`);
  let body = stripMigrationPreamble(fs.readFileSync(fp, 'utf8'));

  if (file === 'supabase_admin_gift_migration.sql') {
    body = removeFunctionBlock(body, 'create_order_atomic');
  }
  if (file === 'supabase_syriatel_payment_migration.sql') {
    body = removeFunctionBlock(body, 'create_order_atomic');
    body = removeFunctionBlock(body, 'new_sam_webhook_secret');
  }
  if (file === 'supabase_moderation_migration.sql') {
    body = removeFunctionBlock(body, 'create_order_atomic');
    body = removeFunctionBlock(body, 'create_recharge_request');
  }

  if (file === 'supabase_sam_invoice_orders_migration.sql') {
    const m = body.match(/CREATE OR REPLACE FUNCTION public\.create_order_atomic\([\s\S]*?\nEND;\n\$\$;/m);
    if (m) {
      canonicalOrder = patchCreateOrderAtomic(m[0]);
      body = body.replace(m[0], '-- create_order_atomic: canonical copy in §27\n');
    }
  }

  const label = file.replace('supabase_', '').replace('_migration.sql', '');
  appendParts.push(`-- =============================================================================\n-- APPEND: ${label}\n-- =============================================================================\n\n${body}`);
}

if (canonicalOrder) {
  appendParts.push(`-- =============================================================================\n-- §27 Canonical create_order_atomic\n-- =============================================================================\n\n${canonicalOrder}\n\nREVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;\nGRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;`);
}

const finalEnd = findEndMarkerIndex(full);
full = `${full.slice(0, finalEnd).trimEnd()}\n\n${appendParts.join('\n\n')}\n\n${full.slice(finalEnd)}`;

fs.writeFileSync(fullPath, full, 'utf8');
console.log(`Merged ${fullPath} (${full.split('\n').length} lines)`);

// Stub standalone migrations (not full.sql)
for (const f of fs.readdirSync(root)) {
  if (!f.startsWith('supabase_') || !f.endsWith('.sql') || f === 'supabase_echocore_full.sql') continue;
  if (f.includes('complete_schema') || f.includes('fresh_start') || f.includes('reset_admin')) continue;
  const section = SKIP_APPEND.has(f) ? '§11/§16' : '§17–§27';
  fs.writeFileSync(path.join(root, f), POINTER(section), 'utf8');
}
console.log('Stubbed standalone migration files');