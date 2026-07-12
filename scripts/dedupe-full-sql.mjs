/**
 * Remove duplicate function bodies — keeps LAST definition only.
 * Safe: matches bounded CREATE...END;$$ blocks only.
 */
import fs from 'fs';
import path from 'path';

const fullPath = path.join(path.resolve(import.meta.dirname, '..'), 'supabase_echocore_full.sql');
let text = fs.readFileSync(fullPath, 'utf8');

const FN_NAMES = [
  'create_recharge_request',
  'admin_run_mock_purchase',
  'get_payment_methods',
  'get_sam_api_settings',
  'save_sam_api_settings',
  'get_my_active_recharge_request',
  'admin_get_user_profile',
  'protect_profile_sensitive_fields',
  'handle_new_user',
  'generate_default_username',
];

function findBlocks(sql, fn) {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([^;]*?\\)[\\s\\S]*?\\nEND;\\n\\$\\$;`, 'g');
  const blocks = [];
  let m;
  while ((m = re.exec(sql)) !== null) {
    blocks.push({ start: m.index, end: m.index + m[0].length });
  }
  return blocks;
}

for (const fn of FN_NAMES) {
  const blocks = findBlocks(text, fn);
  if (blocks.length <= 1) continue;
  const drop = blocks.slice(0, -1).sort((a, b) => b.start - a.start);
  for (const b of drop) {
    if (b.end - b.start > 8000) {
      console.warn(`Skip ${fn} block at ${b.start} — span too large (${b.end - b.start})`);
      continue;
    }
    text = `${text.slice(0, b.start)}-- (removed older ${fn}; see later definition)\n${text.slice(b.end)}`;
  }
  console.log(`${fn}: removed ${drop.length}`);
}

// One GRANT for get_payment_methods
const grant = 'GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;';
let pos = text.indexOf(grant);
while (pos !== -1) {
  const next = text.indexOf(grant, pos + grant.length);
  if (next === -1) break;
  text = text.slice(0, pos) + text.slice(pos + grant.length);
  pos = text.indexOf(grant, pos);
}
console.log('Deduped get_payment_methods grants');

fs.writeFileSync(fullPath, text, 'utf8');
console.log(`Done: ${text.split('\n').length} lines`);