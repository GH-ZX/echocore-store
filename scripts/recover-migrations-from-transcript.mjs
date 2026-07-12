import fs from 'fs';
import path from 'path';

const transcripts = [
  'C:/Users/Administrator/.grok/sessions/C%3A%5CUsers%5CUsers%5CAdministrator%5CCoding%5Cechocore-store/019f4759-4e92-74b3-8852-e9e4dfd09484/updates.jsonl',
  'C:/Users/Administrator/.grok/sessions/C%3A%5CUsers%5CAdministrator%5CCoding%5Cechocore-store/019f4759-4e92-74b3-8852-e9e4dfd09484/updates.jsonl',
  'C:/Users/Administrator/.grok/sessions/C%3A%5CUsers%5CAdministrator%5CCoding%5Cechocore-store/019f5470-c00e-7b91-b3bf-bb9a5643b627/updates.jsonl',
].map((p) => p.replace('/Users/Users/', '/Users/'));

const root = path.resolve(import.meta.dirname, '..');
const recovered = new Map();

function ingest(transcript) {
  if (!fs.existsSync(transcript)) {
    console.warn('Skip missing', transcript);
    return;
  }
  const pending = new Map();
  for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const upd = o?.params?.update;
    if (!upd) continue;

    if (upd.sessionUpdate === 'tool_call') {
      const ri = upd.rawInput || {};
      const p = (ri.path || '').replace(/\\/g, '/');
      if (p.includes('supabase_') && p.endsWith('.sql') && !p.endsWith('supabase_echocore_full.sql')) {
        pending.set(upd.toolCallId, path.basename(p));
      }
    }

    if (upd.sessionUpdate === 'tool_call_update' && upd.status === 'completed') {
      const fname = pending.get(upd.toolCallId);
      if (!fname) continue;
      const text = (upd.content || []).map((c) => c?.content?.text || '').join('\n');
      if (text.length > 200 && (text.includes('CREATE') || text.includes('ALTER'))) {
        const prev = recovered.get(fname);
        if (!prev || text.length > prev.length) recovered.set(fname, text);
      }
      pending.delete(upd.toolCallId);
    }
  }
}

for (const t of transcripts) ingest(t);

for (const [fname, body] of recovered) {
  if (!fname.startsWith('supabase_')) continue;
  const out = path.join(root, fname);
  fs.writeFileSync(out, body, 'utf8');
  console.log(`Recovered ${fname} (${body.split('\n').length} lines)`);
}
console.log(`Total recovered: ${recovered.size}`);