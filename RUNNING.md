# تشغيل المشروع (ECHOCORE Store)

**الموقع المباشر:** https://www.echocore412.com

## المتطلبات

- Node.js 18+
- npm
- مشروع Supabase (انظر [SUPABASE_SETUP.ar.md](./SUPABASE_SETUP.ar.md))

---

## التشغيل محلياً

```bash
git clone https://github.com/GH-ZX/echocore-store.git
cd echocore-store
npm install
cp .env.example .env
```

أضف `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` في `.env`.

```bash
npm run dev
```

افتح: http://localhost:5173

---

## قاعدة البيانات

شغّل ملفاً واحداً في Supabase SQL Editor:

**[supabase_echocore_full.sql](./supabase_echocore_full.sql)**

---

## البناء والمعاينة

```bash
npm run build
npm run preview
```

---

## النشر (GitHub Pages)

- الدفع إلى فرع `main` يفعّل `.github/workflows/deploy.yml`
- الناتج في `dist/` يُرفع تلقائياً
- النطاق: **www.echocore412.com** (عبر `VITE_SITE_DOMAIN` في أسرار GitHub)

### أسرار GitHub Actions المطلوبة

| السر | القيمة |
|------|--------|
| `VITE_SUPABASE_URL` | رابط مشروع Supabase |
| `VITE_SUPABASE_ANON_KEY` | مفتاح anon |
| `VITE_SITE_DOMAIN` | `www.echocore412.com` |
| `VITE_BASE_PATH` | `/` |

### Supabase Auth (إنتاج)

- Site URL: `https://www.echocore412.com`
- Redirect: `https://www.echocore412.com/login` و `https://www.echocore412.com/**`

---

## أوامر مفيدة

| الأمر | الوصف |
|-------|--------|
| `npm run dev` | التطوير |
| `npm run build` | بناء الإنتاج |
| `npm run lint` | ESLint |
| `npm run preview` | معاينة `dist/` |

---

## إدارة المتجر

1. سجّل حساباً ثم `role = admin` في `profiles`
2. افتح `/dashboard`
3. الصور تُرفع إلى bucket `product-images` في Supabase

للتفاصيل: `vite.config.js` · `.github/workflows/deploy.yml` · [PROJECT_MAP.ar.md](./PROJECT_MAP.ar.md)