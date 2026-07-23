# Domain & DNS — echocore412.com

**Canonical site:** `https://www.echocore412.com`  
**Host:** GitHub Pages (`gh-zx.github.io`)  
**Registrar DNS (today):** GoDaddy (`ns09` / `ns10.domaincontrol.com`)

---

## What’s wrong right now (checked live)

| Host | Status |
|------|--------|
| `www` | OK — CNAME → `gh-zx.github.io` · HTTPS works |
| Apex `echocore412.com` | **Broken mix** — GitHub A records **plus** two Amazon/GoDaddy A records (`15.197.225.128`, `3.33.251.168`) |
| HTTPS on apex | Unreliable / wrong (405 from non-GitHub endpoint) |

Those extra A records are typical **GoDaddy domain forwarding / parking**. They break a clean apex → GitHub Pages setup.

---

## Goal

1. **One canonical host:** `https://www.echocore412.com`
2. Apex either:
   - serves GitHub Pages cleanly and **redirects to www**, or  
   - redirects at DNS/forwarding level to www
3. No stray AWS/GoDaddy A records on the apex

---

## Fix A — GoDaddy only (do this first, ~10 minutes)

### 1) Open DNS

GoDaddy → **My Products** → **Domains** → `echocore412.com` → **DNS** / **Manage DNS**.

### 2) Apex (`@`) A records

**Keep only** these four (GitHub Pages):

| Type | Name | Value | TTL |
|------|------|--------|-----|
| A | `@` | `185.199.108.153` | 600 / 1 hour |
| A | `@` | `185.199.109.153` | 600 / 1 hour |
| A | `@` | `185.199.110.153` | 600 / 1 hour |
| A | `@` | `185.199.111.153` | 600 / 1 hour |

**Delete** any other A (or AAAA) on `@`, especially:

- `15.197.225.128`
- `3.33.251.168`

### 3) `www` CNAME

| Type | Name | Value | TTL |
|------|------|--------|-----|
| CNAME | `www` | `gh-zx.github.io.` | 600 / 1 hour |

(Trailing dot optional in GoDaddy UI.)

### 4) Turn off GoDaddy “Forwarding”

Domain → **Forwarding**:

- Disable **Domain** forwarding (HTTP/HTTPS to somewhere else), **or**
- If you keep forwarding, set it to **https://www.echocore412.com** with **301 permanent** and **do not** also keep conflicting A records (forwarding often injects the AWS IPs).

Preferred: **no forwarding**, pure GitHub A records + www CNAME, and let GitHub redirect apex → www when the custom domain is set to `www.echocore412.com` in the repo Pages settings.

### 5) GitHub Pages

Repo **Settings → Pages**:

- Custom domain: `www.echocore412.com`
- **Enforce HTTPS** checked  
- Wait until DNS check is green

Deploy already writes `CNAME` from secret `VITE_SITE_DOMAIN=www.echocore412.com`.

### 6) Supabase Auth (already expected)

- Site URL: `https://www.echocore412.com`
- Redirect URLs include:
  - `https://www.echocore412.com/login`
  - `https://www.echocore412.com/**`
  - `http://localhost:5173/login`

### 7) Wait & verify

DNS can take 5–60 minutes (sometimes up to 48h).

```bash
dig +short echocore412.com A
# expect ONLY the four 185.199.x.x addresses — no 15.197 / 3.33

dig +short www.echocore412.com CNAME
# expect gh-zx.github.io.

curl -sI https://www.echocore412.com | head -5
curl -sI https://echocore412.com | head -10
# apex should 301/302 to https://www.echocore412.com/ (or at least load GitHub Pages)
```

---

## Fix B — Cloudflare in front (optional upgrade)

Use when you want **security headers**, WAF, and rock-solid apex→www redirects.

1. Create free Cloudflare account → **Add site** `echocore412.com`
2. Cloudflare scans DNS → keep:
   - `@` → four GitHub A records (proxy **DNS only** grey cloud **or** orange if you use Workers later; start with **DNS only** for GitHub Pages SSL simplicity)
   - `www` → CNAME `gh-zx.github.io` (same)
3. At GoDaddy, change **nameservers** to the two Cloudflare assigns (replace `domaincontrol.com`)
4. Cloudflare **Rules → Redirect rules**:
   - If hostname equals `echocore412.com` → dynamic redirect to `https://www.echocore412.com${uri}` · status **301**
5. **SSL/TLS**: Full (or Full strict once certs are happy)
6. Optional **Transform Rules → Response headers**:
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`)

> GitHub Pages alone **cannot** set custom security headers. Cloudflare (or Netlify/Vercel) can.

---

## App-side (already in repo)

- Auth redirects use `VITE_SITE_DOMAIN` → `https://www.echocore412.com`
- Production boot: if someone hits apex and the SPA loads, they are redirected to `www` (`src/lib/siteDomain.js`)

DNS cleanup is still **required** so apex HTTPS hits GitHub, not GoDaddy’s AWS endpoints.

---

## Checklist

- [ ] Delete apex A records `15.197.225.128` and `3.33.251.168`
- [ ] Apex has only four GitHub A records
- [ ] `www` CNAME → `gh-zx.github.io`
- [ ] GoDaddy domain forwarding off (or 301 to www only, no conflicting A’s)
- [ ] GitHub Pages custom domain = `www.echocore412.com` + Enforce HTTPS
- [ ] Supabase Site URL / redirects use www
- [ ] `dig` shows clean apex; HTTPS apex → www
- [ ] (Optional) Cloudflare NS + redirect + headers

After you change DNS, say **“recheck domain”** and we can re-run `dig` / `curl` to confirm.
