# Project hooks (safety only)

These hooks do **not** inject orientation context (use `AGENTS.md` + `/echocore-orientation` for that).

| File | Event | Purpose |
|------|--------|---------|
| `safe-shell.json` | `PreToolUse` (shell) | Deny catastrophic shell patterns (rm -rf /, force-push main, staging `.env`, etc.) |

## Trust (required once)

Project hooks only run after folder trust:

```text
/hooks-trust
```

or launch with `--trust`. Trust is stored in `~/.grok/trusted_folders.toml`.

Check load status with `/hooks`.

## Scripts

- `scripts/safe-shell.mjs` — Node guard; fail-open on parse errors (Grok hooks fail open on crash too).
