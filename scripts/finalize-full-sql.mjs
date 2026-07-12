import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const p = path.join(root, 'supabase_echocore_full.sql');
let s = fs.readFileSync(p, 'utf8');

// 1. Drop stale §06 create_order_atomic (keep §27 canonical)
s = s.replace(
  /-- ---------------------------------------------------------------------------\r?\n-- 4\. BALANCE PURCHASES[\s\S]*?-- ---------------------------------------------------------------------------\r?\n-- 5\. DEV WALLET RPCs/,
  `-- ---------------------------------------------------------------------------\n-- 4. BALANCE PURCHASES — see §27 canonical create_order_atomic\n-- ---------------------------------------------------------------------------\n\n-- ---------------------------------------------------------------------------\n-- 5. DEV WALLET RPCs`,
);

// 2. Drop legacy single-arg create_recharge_request
s = s.replace(
  /CREATE OR REPLACE FUNCTION public\.create_recharge_request\(p_amount numeric\)[\s\S]*?GRANT EXECUTE ON FUNCTION public\.create_recharge_request\(numeric\) TO authenticated;\r?\n\r?\n/,
  '-- (superseded create_recharge_request — see §26 append)\n\n',
);

// 3. Charm column + save/get g2bulk RPC fix
if (!s.includes('g2bulk_charm_pricing_enabled boolean')) {
  s = s.replace(
    /ADD COLUMN IF NOT EXISTS g2bulk_pull_selection jsonb/,
    `ADD COLUMN IF NOT EXISTS g2bulk_charm_pricing_enabled boolean NOT NULL DEFAULT false;\n\nALTER TABLE public.store_settings\n  ADD COLUMN IF NOT EXISTS g2bulk_pull_selection jsonb`,
  );
}

s = s.replace(
  /CREATE OR REPLACE FUNCTION public\.save_g2bulk_settings\(\s*p_enabled boolean,[\s\S]*?GRANT EXECUTE ON FUNCTION public\.save_g2bulk_settings\(boolean, numeric, text, boolean, boolean, smallint, text, text\) TO authenticated;/,
  fs.readFileSync(path.join(root, 'scripts', '_charm_g2bulk_rpc.sql'), 'utf8').trim(),
);

if (!s.includes("'g2bulk_charm_pricing_enabled'")) {
  s = s.replace(
    /('g2bulk_markup_percent', COALESCE\(v_row\.g2bulk_markup_percent, 15\),)/,
    `$1\n    'g2bulk_charm_pricing_enabled', COALESCE(v_row.g2bulk_charm_pricing_enabled, false),`,
  );
}

// 4. Sam clear-key (8-param save)
const clear = `-- §28 Sam API clear-key
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean);
CREATE OR REPLACE FUNCTION public.save_sam_api_settings(
  p_enabled boolean, p_wallet_mode text DEFAULT 'manual',
  p_shamcash_wallet_identifier text DEFAULT null, p_syriatel_wallet_identifier text DEFAULT null,
  p_invoice_currency text DEFAULT 'USD', p_api_key text DEFAULT null,
  p_regenerate_webhook_secret boolean DEFAULT false, p_clear_api_key boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trim_key text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_wallet_mode IS NOT NULL AND p_wallet_mode NOT IN ('manual', 'api') THEN RAISE EXCEPTION 'Invalid wallet mode'; END IF;
  IF p_invoice_currency IS NOT NULL AND p_invoice_currency NOT IN ('USD', 'SYP', 'EUR') THEN RAISE EXCEPTION 'Invalid invoice currency'; END IF;
  v_trim_key := nullif(trim(p_api_key), '');
  UPDATE public.store_settings SET
    sam_api_enabled = CASE WHEN COALESCE(p_clear_api_key, false) THEN false ELSE COALESCE(p_enabled, false) END,
    sam_wallet_mode = COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual'),
    sam_shamcash_wallet_identifier = COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier),
    sam_syriatel_wallet_identifier = COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier),
    sam_invoice_currency = COALESCE(nullif(trim(p_invoice_currency), ''), sam_invoice_currency, 'USD'),
    sam_api_key = CASE WHEN COALESCE(p_clear_api_key, false) THEN null WHEN p_api_key IS NOT NULL THEN v_trim_key ELSE sam_api_key END,
    sam_webhook_secret = CASE WHEN p_regenerate_webhook_secret THEN public.new_sam_webhook_secret() WHEN sam_webhook_secret IS NULL OR length(trim(sam_webhook_secret)) = 0 THEN public.new_sam_webhook_secret() ELSE sam_webhook_secret END,
    updated_at = now() WHERE id = 1;
  RETURN public.get_sam_api_settings();
END; $$;
REVOKE EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean) TO authenticated;`;

if (!s.includes('p_clear_api_key')) {
  s = s.replace(/(-- END OF ECHOCORE SUPABASE SETUP)/, `${clear}\n\n$1`);
}

s = s.replace(/-- Version: 0\.5\.0[^\n]*/, '-- Version: 0.6.0 — single file; migration stubs deprecated');

fs.writeFileSync(p, s);
console.log(s.split('\n').length, 'lines');