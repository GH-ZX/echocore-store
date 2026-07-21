#!/usr/bin/env node
/**
 * PreToolUse guard for shell commands.
 * Blocks catastrophic / clearly destructive patterns. Fail-open on parse errors.
 */
import { readFileSync } from 'node:fs';

function allow() {
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(JSON.stringify({ decision: 'deny', reason }));
  process.exit(0);
}

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  allow();
}

let payload;
try {
  payload = JSON.parse(raw || '{}');
} catch {
  allow();
}

const tool = String(payload.toolName || payload.tool_name || '');
const input = payload.toolInput || payload.tool_input || {};
const cmd = String(input.command || input.cmd || '');

// Only gate shell tools (matcher already filters, but be defensive)
const isShell =
  /bash|shell|run_terminal|terminal|powershell|cmd/i.test(tool) || cmd.length > 0;
if (!isShell || !cmd) allow();

const patterns = [
  {
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+(\/|\/\*|~|~\/)\b/,
    reason: 'Blocked: recursive force-delete of filesystem root or home',
  },
  {
    re: /\brm\s+-rf\s+\/\s*$/,
    reason: 'Blocked: rm -rf /',
  },
  {
    re: /\b(Remove-Item|ri|rd|rmdir)\b[\s\S]*\b(-Recurse|-r)\b[\s\S]*\b(-Force|-f)\b[\s\S]*([A-Za-z]:\\?\s*$|[A-Za-z]:\\\s|\/s\s)/i,
    reason: 'Blocked: recursive force-delete of a drive root',
  },
  {
    re: /\b(format|mkfs(\.\w+)?)\b/i,
    reason: 'Blocked: disk format / mkfs',
  },
  {
    re: /\bdd\s+if=/i,
    reason: 'Blocked: dd if= (potential disk wipe)',
  },
  {
    re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
    reason: 'Blocked: fork bomb',
  },
  {
    re: /\bgit\s+push\b[\s\S]*\b(--force|--force-with-lease|-f)\b[\s\S]*\b(main|master)\b/i,
    reason: 'Blocked: force-push to main/master. Use a feature branch or confirm with the user first.',
  },
  {
    re: /\bgit\s+reset\s+--hard\b[\s\S]*\b(origin\/(main|master)|HEAD~[3-9]|HEAD~[1-9][0-9]+)\b/i,
    reason: 'Blocked: destructive hard reset against main/master or large history rewind',
  },
  {
    re: /\b(drop\s+database|drop\s+schema)\b/i,
    reason: 'Blocked: DROP DATABASE/SCHEMA',
  },
  {
    re: /\b(supabase\s+db\s+reset)\b/i,
    reason: 'Blocked: supabase db reset (destroys local DB). Confirm with the user first.',
  },
];

for (const { re, reason } of patterns) {
  if (re.test(cmd)) deny(reason);
}

// Block committing common secret files in the same command line
if (/\bgit\s+add\b/.test(cmd) && /(^|[\s/\\])\.env(\s|$|\.local)/.test(cmd)) {
  deny('Blocked: staging .env (secrets). Use .env.example only.');
}

allow();
