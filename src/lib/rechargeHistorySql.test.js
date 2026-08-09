import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL('../../supabase/migrations/20260809210000_customer_sam_recipients.sql', import.meta.url),
  'utf8',
);
const bootstrapSql = readFileSync(
  new URL('../../supabase_echocore_full.sql', import.meta.url),
  'utf8',
);

describe('admin recharge history SQL', () => {
  it('uses the request reference when a linked manual credit has no explicit ref', () => {
    expect(bootstrapSql).toMatch(/v_result := public\.admin_adjust_user_balance\([\s\S]+?COALESCE\(\s*NULLIF\(TRIM\(p_transaction_ref\), ''\),\s*CASE WHEN p_recharge_request_id IS NOT NULL THEN v_req\.reference END\s*\)[\s\S]+?\);/i);
  });

  it('derives credit status and amount from completed recharge ledger rows', () => {
    expect(migrationSql).toMatch(/transactions[\s\S]+type = 'recharge'[\s\S]+status = 'completed'/i);
    expect(migrationSql).toMatch(/credit_status[\s\S]+credited_amount[\s\S]+transactions/i);
    expect(migrationSql).toMatch(/type in \('recharge', 'adjustment'\)/i);
    expect(migrationSql).toMatch(/metadata->>'recharge_request_id'/i);
  });

  it('reconciles only legacy approved manual adjustments inside the request review window', () => {
    for (const sql of [migrationSql, bootstrapSql]) {
      expect(sql).toMatch(/t\.type = 'adjustment'[\s\S]+?t\.payment_method = 'admin_manual'[\s\S]+?t\.amount = r\.amount/i);
      expect(sql).toMatch(/t\.created_at >= r\.created_at[\s\S]+?t\.created_at <= r\.reviewed_at/i);
      expect(sql).toMatch(/r\.status = 'approved'/i);
      expect(sql).toMatch(/metadata[\s\S]+?recharge_request_id[\s\S]+?requestId[\s\S]+?rechargeRequestId/i);
    }
  });

  it('assigns an overlapping legacy transaction to only one request deterministically', () => {
    for (const sql of [migrationSql, bootstrapSql]) {
      expect(sql).toMatch(/not exists\s*\(\s*select 1\s+from public\.recharge_requests competing[\s\S]+?competing\.user_id = r\.user_id[\s\S]+?competing\.amount = r\.amount[\s\S]+?t\.created_at >= competing\.created_at[\s\S]+?t\.created_at <= competing\.reviewed_at[\s\S]+?competing\.created_at > r\.created_at[\s\S]+?competing\.id > r\.id/i);
    }
  });

  it('includes the same bounded history RPC in the bootstrap schema', () => {
    expect(bootstrapSql).toContain('CREATE OR REPLACE FUNCTION public.list_admin_recharge_history(');
    expect(bootstrapSql).toContain('CREATE OR REPLACE FUNCTION public.list_admin_recharge_history_rows(');
    expect(bootstrapSql).toMatch(/v_page_size int := least\(greatest\(coalesce\(p_page_size, 25\), 1\), 100\);/i);
    expect(bootstrapSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_admin_recharge_history\(int, int, text, text, text, uuid\) TO authenticated;/i);
    expect(bootstrapSql).toMatch(/RETURN jsonb_build_object\([\s\S]+?END;\s*\$\$;\s*\n\s*-- -+\s*\n\s*-- Admin recharge history/i);
    expect(bootstrapSql).toMatch(/'byCreditStatus', v_by_credit_status/i);
  });

  it('validates the passed admin id instead of relying on auth.uid() under the service role', () => {
    for (const sql of [migrationSql, bootstrapSql]) {
      expect(sql).toMatch(/p_admin_id uuid DEFAULT null/i);
      expect(sql).toMatch(/if p_admin_id is null/i);
      expect(sql).toMatch(/not exists \(select 1 from public\.profiles where id = p_admin_id and role = 'admin'\)/i);
      expect(sql).toMatch(/list_admin_recharge_history\([\s\S]{0,3000}?p_admin_id uuid DEFAULT null[\s\S]*?raise exception 'Unauthorized';/i);
    }
  });

  it('keeps the canonical order function and history RPC definitions closed and ordered', () => {
    expect(bootstrapSql.indexOf('-- §31 CANONICAL create_order_atomic')).toBeLessThan(
      bootstrapSql.indexOf('-- Admin recharge history'),
    );
    expect(bootstrapSql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_order_atomic\([\s\S]+?END;\s*\$\$;[\s\S]*?-- Admin recharge history/i);
    expect(bootstrapSql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_admin_recharge_history_rows\([\s\S]+?END;\s*\$\$;|\$\$;\s*\n\s*\nCREATE OR REPLACE FUNCTION public\.list_admin_recharge_history\(/i);
  });
});
