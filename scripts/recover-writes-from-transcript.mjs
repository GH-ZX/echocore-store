import fs from 'fs';
import path from 'path';

const transcripts = [
  'C:/Users/Administrator/.grok/sessions/C%3A%5CUsers%5CAdministrator%5CCoding%5Cechocore-store/019f4759-4e92-74b3-8852-e9e4dfd09484/updates.jsonl',
  'C:/Users/Administrator/.grok/sessions/C%3A%5CUsers%5CAdministrator%5CCoding%5Cechocore-store/019f5470-c00e-7b91-b3bf-bb9a5643b627/updates.jsonl',
];
const root = path.resolve(import.meta.dirname, '..');
const best = new Map();

for (const transcript of transcripts) {
  if (!fs.existsSync(transcript)) continue;
  for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const upd = o?.params?.update;
    if (!upd || upd.sessionUpdate !== 'tool_call') continue;
    const ri = upd.rawInput || {};
    const p = (ri.path || '').replace(/\\/g, '/');
    if (!p.includes('supabase_') || !p.endsWith('.sql')) continue;
    const fname = path.basename(p);
    if (fname === 'supabase_echocore_full.sql') continue;
    const contents = ri.contents || '';
    if (contents.length > 100) {
      const prev = best.get(fname);
      if (!prev || contents.length > prev.length) best.set(fname, contents);
    }
  }
}

for (const [fname, body] of best) {
  fs.writeFileSync(path.join(root, fname), body, 'utf8');
  console.log(`Write recovered ${fname} (${body.split('\n').length} lines, ${body.length} chars)`);
}
console.log(`Total: ${best.size}`);