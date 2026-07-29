# دليل النسخ الكامل — EchoCore Store → مستخدم جديد

> **الهدف:** نسخ المشروع بالكامل إلى مستخدم آخر مع Supabase جديد وAPIs مختلفة وGitHub منفصل، مع الإبقاء على المشروع الأصلي سليماً تماماً.

---

## جدول المحتويات

1. [نظرة عامة على البنية](#1-نظرة-عامة-على-البنية)
2. [المتطلبات المسبقة](#2-المتطلبات-المسبقة)
3. [نسخ الكود محلياً](#3-نسخ-الكود-محلياً)
4. [إنشاء Supabase Project جديد](#4-إنشاء-supabase-project-جديد)
5. [تشغيل قاعدة البيانات](#5-تشغيل-قاعدة-البيانات)
6. [نشر Edge Functions](#6-نشر-edge-functions)
7. [إعداد GitHub Repository الجديد](#7-إعداد-github-repository-الجديد)
8. [تعديل ملفات الهوية](#8-تعديل-ملفات-الهوية)
9. [إعداد Authentication في Supabase](#9-إعداد-authentication-في-supabase)
10. [إعداد GitHub Secrets للـ CI/CD](#10-إعداد-github-secrets-للـ-cicd)
11. [إعداد Domain جديد (اختياري)](#11-إعداد-domain-جديد-اختياري)
12. [إضافة أول Admin](#12-إضافة-أول-admin)
13. [التحقق النهائي](#13-التحقق-النهائي)
14. [جدول ما يتغير وما يبقى](#14-جدول-ما-يتغير-وما-يبقى)
15. [مشكلات شائعة وحلولها](#15-مشكلات-شائعة-وحلولها)
16. [الترتيب الزمني المثالي](#16-الترتيب-الزمني-المثالي)

---

## 1. نظرة عامة على البنية

قبل البدء، من المهم فهم ما يتكون منه المشروع حتى تعرف ما الذي يجب تغييره.

### التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| Frontend | React 19 + Vite 8 (SPA) |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions + Storage) |
| APIs خارجية | G2Bulk (شراء الألعاب) · Sam-API (المحفظة) · IGDB (صور الألعاب) |
| Deploy | GitHub Pages + GitHub Actions |
| Domain | GitHub Pages Custom Domain |

### هيكل المجلدات الرئيسي

```
echocore-store/
├── src/
│   ├── App.jsx                 ← الحالة العامة (state) + hydration من Supabase
│   ├── components/             ← مكونات UI (Header, Footer, Modals, Admin)
│   ├── lib/                    ← منطق Supabase، APIs، cart، i18n (115 ملف)
│   │   ├── supabase.js         ← Client Supabase الوحيد
│   │   ├── g2bulk.js           ← API شراء الألعاب
│   │   ├── samApi.js           ← API المحفظة
│   │   ├── igdb.js             ← API صور الألعاب
│   │   └── auth.js             ← منطق المصادقة
│   ├── data/
│   │   ├── translations.js     ← كل النصوص AR/EN (300KB)
│   │   └── pageContent.js      ← محتوى الصفحات (22KB)
│   └── views/                  ← صفحات الموقع
├── supabase/
│   ├── functions/              ← Edge Functions (server-side)
│   │   ├── g2bulk/             ← شراء من G2Bulk + webhook fulfillment
│   │   ├── g2bulk-sync-cron/   ← مزامنة كتالوج تلقائية يومية
│   │   ├── sam-api/            ← محفظة Sam-API / ShamCash
│   │   ├── igdb/               ← جلب صور الألعاب
│   │   ├── admin-user-auth/    ← إدارة صلاحيات Admin
│   │   └── send-notification-email/ ← إشعارات بريد إلكتروني
│   └── config.toml             ← إعدادات Edge Functions (JWT)
├── supabase_echocore_full.sql  ← كامل قاعدة البيانات (374KB)
├── .github/workflows/deploy.yml ← GitHub Actions للنشر التلقائي
├── index.html                  ← نقطة الدخول + SEO meta tags
├── vite.config.js              ← إعدادات Vite + base path logic
├── package.json                ← اسم المشروع + اعتمادات
├── .env                        ← المفاتيح السرية (لا ترفعها لـ GitHub!)
└── .env.example                ← نموذج للمفاتيح المطلوبة
```

### المفاتيح التي يجب تغييرها

| المفتاح | أين يُستخدم | يحتاج حساب جديد من |
|---------|-------------|---------------------|
| `VITE_SUPABASE_URL` | `.env` + GitHub Secrets | supabase.com |
| `VITE_SUPABASE_ANON_KEY` | `.env` + GitHub Secrets | supabase.com |
| `G2BULK_API_KEY` | Supabase Edge Function Secrets | g2bulk.com |
| `G2BULK_CRON_SECRET` | Supabase Vault + cron | توليد عشوائي |
| `SAM_API_KEY` | Supabase Edge Function Secrets | Sam-API provider |
| IGDB credentials | Admin Dashboard (DB) | console.cloud.google.com |

---

## 2. المتطلبات المسبقة

### على الجهاز

```powershell
# تحقق من Node.js (يجب 20+)
node --version

# تحقق من Git
git --version

# تثبيت Supabase CLI
npm install -g supabase

# تحقق
supabase --version
```

### الحسابات المطلوبة

- [ ] **GitHub** — حساب جديد أو ريبو جديد
- [ ] **Supabase** — مشروع جديد على https://supabase.com
- [ ] **G2Bulk** — حساب جديد للحصول على `G2BULK_API_KEY`
- [ ] **Sam-API** — حساب جديد للحصول على `SAM_API_KEY`
- [ ] **Google Cloud Console** — OAuth client لـ IGDB وGoogle Sign-In

---

## 3. نسخ الكود محلياً

هذه الخطوة تنسخ كل الملفات إلى مجلد جديد **بدون المساس بالمشروع الأصلي**.

### الأمر (Windows PowerShell)

```powershell
# عرّف المسارات
$source = "C:\Users\Administrator\Coding\echocore-store"
$dest   = "C:\Users\Administrator\Coding\newstore"   # ← غيّر الاسم

# نسخ كل شيء ما عدا المجلدات المؤقتة وgit history
robocopy $source $dest /E /XD `
  node_modules `
  dist `
  .git `
  .agent `
  .gemini `
  .claude `
  .grok `
  .cursor `
  terminals `
  adapters `
  agent-tools `
  mcps

Write-Host "✅ تم النسخ بنجاح إلى: $dest"
```

> **لماذا نستثني هذه المجلدات؟**
>
> | مجلد | السبب |
> |------|-------|
> | `node_modules` | ضخم جداً، يُعاد تثبيته بـ `npm install` |
> | `dist` | build مؤقت، يُعاد بناؤه |
> | `.git` | تاريخ git القديم — المشروع الجديد يبدأ نظيفاً |
> | `.agent`, `.gemini`, `.grok`, `.claude`, `.cursor` | ملفات AI agents خاصة بالمطور الأصلي |
> | `terminals`, `adapters`, `agent-tools`, `mcps` | أدوات تطوير خاصة بالمطور الأصلي |

### تثبيت الاعتمادات

```powershell
cd $dest
npm install
```

### تحقق أولي (سيعطي خطأ Supabase — طبيعي)

```powershell
npm run dev
# يفتح http://localhost:5173
# خطأ Supabase connection طبيعي قبل إضافة .env
```

---

## 4. إنشاء Supabase Project جديد

### من Dashboard

1. اذهب إلى **https://supabase.com/dashboard**
2. اضغط **"New project"**
3. أدخل:
   - **Name:** `newstore-db`
   - **Database Password:** كلمة مرور قوية — **احفظها!**
   - **Region:** Europe West أو Singapore (الأقرب)
4. اضغط **"Create new project"** — انتظر ~2 دقيقة

### احصل على المفاتيح

```
Supabase Dashboard → Settings → API

احفظ:
  Project URL:     https://xxxxxxxxxxxx.supabase.co
  anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Project Ref:     xxxxxxxxxxxx  (الكود القصير من URL)
```

---

## 5. تشغيل قاعدة البيانات

الملف `supabase_echocore_full.sql` (374KB) يحتوي على:

- كل الجداول: `profiles`, `games`, `offers`, `orders`, `notifications`...
- كل الـ RLS Policies (Row Level Security)
- كل الـ Functions و Triggers
- بيانات أولية (seed data) للألعاب الأساسية

### طريقة A — عبر SQL Editor (للملفات الصغيرة)

1. Supabase → **SQL Editor** → **New query**
2. افتح `supabase_echocore_full.sql` في Notepad أو VS Code
3. انسخ المحتوى كاملاً
4. الصقه في SQL Editor
5. اضغط **"Run"** وانتظر (30–60 ثانية)

### طريقة B — عبر CLI (موصى بها للملفات الكبيرة)

```powershell
cd $dest

# تسجيل دخول
supabase login

# ربط بالمشروع الجديد
supabase link --project-ref xxxxxxxxxxxx
# أدخل كلمة مرور قاعدة البيانات عند الطلب

# تشغيل الـ SQL
supabase db push --file supabase_echocore_full.sql
```

> ⚠️ إذا ظهر خطأ `timeout` في Dashboard، استخدم CLI دائماً.

### إنشاء Storage Bucket

```sql
-- في SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT DO NOTHING;
```

أو من Dashboard: **Storage → New bucket → اسم: `product-images` → Public ✅**

---

## 6. نشر Edge Functions

### نشر كل الـ Functions

```powershell
cd $dest

# تأكد من الربط بالمشروع الجديد
supabase link --project-ref xxxxxxxxxxxx

# نشر كل Function
supabase functions deploy g2bulk
supabase functions deploy g2bulk-sync-cron
supabase functions deploy sam-api
supabase functions deploy igdb
supabase functions deploy admin-user-auth
supabase functions deploy send-notification-email
```

### إضافة Secrets للـ Edge Functions

هذه المفاتيح تعمل على server-side فقط وليست في `.env` العام:

```powershell
# G2Bulk API Key — من حساب G2Bulk الجديد
supabase secrets set G2BULK_API_KEY="NEW_USER_G2BULK_KEY"

# Cron Secret — أي نص عشوائي طويل
supabase secrets set G2BULK_CRON_SECRET="my-random-cron-secret-abc123"

# Sam-API Key — من حساب Sam-API الجديد
supabase secrets set SAM_API_KEY="NEW_USER_SAM_KEY"
```

> أو عبر Dashboard:
> **Supabase → Settings → Edge Functions → Secrets → Add new secret**

### إضافة الـ Cron Secret إلى Supabase Vault

```sql
-- في SQL Editor — نفس قيمة G2BULK_CRON_SECRET
SELECT vault.create_secret(
  'my-random-cron-secret-abc123',
  'g2bulk_cron_secret'
);
```

### تفعيل Cron Job للمزامنة التلقائية

```
Supabase → Database → Extensions → ابحث عن "pg_cron" → Enable
```

ثم في SQL Editor:

```sql
-- مزامنة كتالوج G2Bulk كل يوم الساعة 3 صباحاً UTC
SELECT cron.schedule(
  'g2bulk-daily-sync',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xxxxxxxxxxxx.supabase.co/functions/v1/g2bulk-sync-cron',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "my-random-cron-secret-abc123"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

---

## 7. إعداد GitHub Repository الجديد

### إنشاء Repository

1. اذهب إلى **github.com** (الحساب الجديد)
2. **"+" → "New repository"**
3. أدخل:
   - **Repository name:** `newstore`
   - **Visibility:** Public (مطلوب لـ GitHub Pages المجاني)
4. **لا تضف** README أو .gitignore
5. اضغط **"Create repository"**

### دفع الكود

```powershell
cd $dest

# تهيئة git جديد
git init

# إضافة كل الملفات (ما عدا ما في .gitignore)
git add .

# أول commit
git commit -m "Initial commit"

# تسمية الـ branch الرئيسي
git branch -M main

# ربط بالريبو الجديد
git remote add origin https://github.com/NEW_USERNAME/newstore.git

# رفع الكود
git push -u origin main
```

> ⚠️ تأكد أن `.env` موجود في `.gitignore` — وهو موجود بالفعل في المشروع. **لا ترفع مفاتيحك أبداً!**

### تفعيل GitHub Pages

```
GitHub → Repository → Settings → Pages
  Source: "GitHub Actions"   ← ليس "Deploy from a branch"
```

---

## 8. تعديل ملفات الهوية

هذه الملفات تحتوي على اسم الموقع والبراند — يجب تغييرها في النسخة الجديدة.

### 8.1 `package.json`

```json
{
  "name": "newstore",
  "version": "1.0.0",
  "author": "New Owner <email@example.com>",
  "license": "UNLICENSED"
}
```

### 8.2 `.env` — إنشاء من المثال

```powershell
Copy-Item ".env.example" ".env"
```

ثم عدّل `.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SITE_DOMAIN=www.yournewdomain.com
VITE_BASE_PATH=/
```

### 8.3 `index.html` — SEO والبراند

ابحث عن كل `echocore412.com` وغيّرها:

```html
<!-- قبل -->
<title>ECHOCORE Store</title>
<meta name="description" content="ECHOCORE Store — instant game top-ups...">
<meta property="og:site_name" content="ECHOCORE Store">
<meta property="og:url" content="https://www.echocore412.com/">
<meta property="og:image" content="https://www.echocore412.com/echo-core-logo.png">
<link rel="canonical" href="https://www.echocore412.com/">
<link rel="icon" href="%BASE_URL%echo-core-logo.png">

<!-- بعد -->
<title>New Store Name</title>
<meta name="description" content="New Store — ...">
<meta property="og:site_name" content="New Store">
<meta property="og:url" content="https://www.yournewdomain.com/">
<meta property="og:image" content="https://www.yournewdomain.com/new-logo.png">
<link rel="canonical" href="https://www.yournewdomain.com/">
<link rel="icon" href="%BASE_URL%new-logo.png">
```

أيضاً في `<body>` (comment):
```html
<!-- قبل -->
<!-- ECHOCORE Store v0.5.0 | Developed by Ahmed Ghawi (@ahmedghx) -->

<!-- بعد -->
<!-- New Store v1.0.0 | Developed by New Developer -->
```

### 8.4 `src/data/translations.js` — اسم الموقع في النصوص

```powershell
# بحث عن كل occurrences أولاً
Select-String -Path "src\data\translations.js" -Pattern "ECHOCORE|EchoCore" | Select-Object LineNumber, Line | Format-Table -AutoSize

# استبدال شامل
(Get-Content "src\data\translations.js") `
  -replace 'ECHOCORE', 'NEW STORE' `
  -replace 'EchoCore', 'New Store' |
  Set-Content "src\data\translations.js" -Encoding UTF8
```

### 8.5 `src/data/pageContent.js` — محتوى الصفحات

```powershell
# بحث عن أي references للبراند القديم
Select-String -Path "src\data\pageContent.js" -Pattern "echocore|echocore412" -CaseInsensitive

# استبدال إذا وُجد
(Get-Content "src\data\pageContent.js") `
  -replace 'echocore412\.com', 'yournewdomain.com' `
  -replace 'ECHOCORE', 'NEW STORE' |
  Set-Content "src\data\pageContent.js" -Encoding UTF8
```

### 8.6 `public/` — Logo وAssets

```
public/
└── echo-core-logo.png    ← استبدل بـ logo جديد باسم مختلف
```

ثم حدّث المرجع في `index.html` (كما ذكر في 8.3).

### 8.7 `supabase/config.toml`

```toml
# أضف project_id في البداية
project_id = "xxxxxxxxxxxx"   # ← PROJECT_REF الجديد

[functions.g2bulk-sync-cron]
verify_jwt = false

[functions.g2bulk]
verify_jwt = false
```

### 8.8 `.env.example` — تنظيف references القديمة

```powershell
(Get-Content ".env.example") `
  -replace 'echocore412\.com', 'yournewdomain.com' `
  -replace 'echocore-store', 'newstore' |
  Set-Content ".env.example" -Encoding UTF8
```

### 8.9 `README.md` و `CLAUDE.md` (اختياري)

إذا أردت إخفاء معلومات المطور الأصلي:

```powershell
# إعادة كتابة README بمحتوى بسيط
Set-Content "README.md" "# New Store`n`nGame top-up store." -Encoding UTF8

# أو احذف CLAUDE.md إذا لم تستخدم Claude Code
Remove-Item "CLAUDE.md"
```

---

## 9. إعداد Authentication في Supabase

### 9.1 URL Configuration

```
Supabase Dashboard → Authentication → URL Configuration

Site URL:
  https://www.yournewdomain.com
  (أو https://NEW_USERNAME.github.io/newstore إذا بدون domain خاص)

Redirect URLs — أضف كل هذه:
  https://www.yournewdomain.com/login
  https://www.yournewdomain.com/**
  http://localhost:5173/login
  http://localhost:5173/**
```

### 9.2 تفعيل Email (OTP)

```
Supabase → Authentication → Providers → Email
  Enable Email provider:    ✅
  Confirm email:            ✅
  Secure email change:      ✅
```

### 9.3 إعداد Google OAuth (لتسجيل الدخول بـ Google)

**في Google Cloud Console:**

1. اذهب إلى **https://console.cloud.google.com**
2. أنشئ مشروع جديد
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Authorized redirect URIs:
   ```
   https://xxxxxxxxxxxx.supabase.co/auth/v1/callback
   ```
6. احفظ **Client ID** و **Client Secret**

**في Supabase:**

```
Authentication → Providers → Google
  Client ID:     [من Google Cloud]
  Client Secret: [من Google Cloud]
```

### 9.4 Email Templates (اختياري — تغيير الاسم)

```
Supabase → Authentication → Email Templates
  → Confirm signup
  → Magic Link
  → Change Email
  غيّر "ECHOCORE" → اسم الموقع الجديد في كل قالب
```

---

## 10. إعداد GitHub Secrets للـ CI/CD

### أين تضيفها

```
GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret
```

### الـ Secrets المطلوبة

| اسم Secret | القيمة | من أين |
|------------|--------|--------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGc...` | Supabase → Settings → API |
| `VITE_BASE_PATH` | `/` | ثابتة |
| `VITE_SITE_DOMAIN` | `www.yournewdomain.com` | domain الخاص بك |

> **بدون domain خاص** (GitHub Pages فقط):
> - `VITE_SITE_DOMAIN` = `NEW_USERNAME.github.io`
> - `VITE_BASE_PATH` = `/newstore/`

---

## 11. إعداد Domain جديد (اختياري)

### في GitHub

```
Repository → Settings → Pages → Custom domain
  أدخل: www.yournewdomain.com
  Save
```

### في DNS Provider (Cloudflare / Namecheap / ...)

```
للـ www subdomain:
  Type: CNAME
  Name: www
  Value: NEW_USERNAME.github.io
  TTL: Auto

للـ apex domain (بدون www):
  Type: A  →  185.199.108.153
  Type: A  →  185.199.109.153
  Type: A  →  185.199.110.153
  Type: A  →  185.199.111.153
```

### تفعيل HTTPS

بعد انتشار DNS (5–30 دقيقة):

```
Repository → Settings → Pages → Enforce HTTPS ✅
```

### CNAME File

```powershell
# أنشئ ملف CNAME في public/ حتى لا يُحذف بعد كل deploy
Set-Content "public\CNAME" "www.yournewdomain.com" -Encoding UTF8
```

---

## 12. إضافة أول Admin

بعد نشر الموقع وتسجيل الدخول بإيميل المدير الجديد:

```sql
-- في Supabase → SQL Editor
UPDATE profiles
SET role = 'admin'
WHERE email = 'admin@yournewdomain.com';

-- تحقق
SELECT id, email, role, username FROM profiles WHERE role = 'admin';
```

---

## 13. التحقق النهائي

### ✅ Checklist المحلي

- [ ] `npm run dev` يعمل على `localhost:5173`
- [ ] لا أخطاء Supabase في console (بعد إضافة `.env`)
- [ ] تسجيل الدخول بـ OTP Email يعمل
- [ ] تسجيل الدخول بـ Google يعمل
- [ ] الكتالوج يظهر (ألعاب وعروض)
- [ ] `npm test` يمر بدون أخطاء
- [ ] `npm run build` ينجح

### ✅ Checklist GitHub / Deploy

- [ ] `git push` يُفعّل GitHub Actions
- [ ] Workflow ينجح: Lint ✅ → Test ✅ → Build ✅ → Deploy ✅
- [ ] الموقع يفتح على GitHub Pages URL
- [ ] HTTPS يعمل

### ✅ Checklist Admin Dashboard

- [ ] الدخول بحساب Admin يُظهر `/dashboard`
- [ ] تبويب **Products** يُظهر قائمة الألعاب
- [ ] تبويب **Orders** يعمل
- [ ] تبويب **Developer** يُظهر أدوات الاختبار

### ✅ Checklist APIs

- [ ] **G2Bulk:** Admin → Supplier Wallets → يظهر الرصيد
- [ ] **IGDB:** صور الألعاب تُحمّل (بعد إضافة credentials من Admin → Settings)
- [ ] **Sam-API:** Wallet tab يُظهر الرصيد

### أوامر التحقق

```powershell
# تشغيل الـ tests
npm test

# بناء محلي للتأكد النهائي
npm run build
npm run preview
# افتح http://localhost:4173
```

---

## 14. جدول ما يتغير وما يبقى

| العنصر | يتغير ✅ | يبقى كما هو ✅ |
|--------|----------|----------------|
| GitHub account / repo | ✅ | |
| Supabase project (URL + Keys) | ✅ | |
| G2Bulk API Key | ✅ | |
| G2Bulk Cron Secret | ✅ | |
| Sam-API Key | ✅ | |
| IGDB credentials | ✅ | |
| Google OAuth Client | ✅ | |
| Domain | ✅ (اختياري) | |
| اسم المشروع (`package.json`) | ✅ | |
| SEO tags (`index.html`) | ✅ | |
| Logo / Brand assets | ✅ | |
| كود React / Vite | | ✅ |
| Edge Functions (الكود كاملاً) | | ✅ |
| SQL Schema + جميع الجداول | | ✅ |
| RLS Policies | | ✅ |
| GitHub Actions Workflow | | ✅ |
| UI / UX / تصميم Tailwind | | ✅ |
| i18n — نصوص عربي/إنجليزي | | ✅ (ما عدا اسم الموقع) |
| منطق Cart والطلبات | | ✅ |
| نظام الإشعارات | | ✅ |
| نظام الـ Coupons | | ✅ |
| لوحة تحكم Admin | | ✅ |
| نظام Invoice | | ✅ |

---

## 15. مشكلات شائعة وحلولها

### 🔴 الموقع يفتح ولكن Supabase لا يتصل

```
خطأ في Console: "FetchError" أو "invalid URL"

الحل:
  1. تحقق من VITE_SUPABASE_URL في .env (محلياً)
  2. تحقق من GitHub Secrets (في CI)
  3. تأكد أن URL يبدأ بـ https:// وليس http://
  4. تأكد من عدم وجود مسافة أو سطر فارغ في القيمة
```

### 🔴 تسجيل الدخول يعيد للصفحة الرئيسية

```
الأسباب الشائعة:
  1. Redirect URLs غير مضافة في Supabase Auth
  2. Site URL في Supabase خاطئ

الحل:
  → Supabase → Authentication → URL Configuration
  → أضف domain الجديد في Site URL
  → أضف كل الـ Redirect URLs
```

### 🔴 GitHub Actions يفشل في خطوة Build

```
خطأ: "VITE_SUPABASE_URL is not defined"

الحل:
  → GitHub → Repository → Settings → Secrets and variables → Actions
  → تأكد من إضافة الـ 4 Secrets
  → أعد تشغيل الـ Workflow يدوياً (Actions → Re-run jobs)
```

### 🔴 Edge Functions تعطي 500 Internal Server Error

```
الأسباب:
  1. الـ Function لم تُنشر بعد
  2. الـ Secrets غير مضبوطة

الحل:
  → supabase functions deploy FUNCTION_NAME
  → تحقق من Secrets في: Supabase → Settings → Edge Functions
  → راجع logs: Supabase → Edge Functions → FUNCTION_NAME → Logs
```

### 🔴 SQL Editor يتوقف (timeout) عند تشغيل الملف الكبير

```
الحل: استخدم CLI
  → supabase link --project-ref xxxxxxxxxxxx
  → supabase db push --file supabase_echocore_full.sql
```

### 🔴 صور الألعاب لا تظهر (IGDB)

```
IGDB credentials لا تُضبط في .env — تُضبط من Admin Dashboard

الحل:
  → سجّل دخول بحساب Admin
  → Admin Dashboard → Settings (أو Developer tab)
  → أضف IGDB Client ID وClient Secret
  → الـ credentials تُخزّن في قاعدة البيانات مشفّرة
```

### 🔴 Domain لا يعمل بعد إضافته

```
الحل:
  1. انتظر 15–30 دقيقة لانتشار DNS
  2. تحقق: nslookup www.yournewdomain.com
  3. تأكد من CNAME File في public/CNAME
  4. فعّل "Enforce HTTPS" في Pages Settings
  5. Supabase → Auth → Redirect URLs → أضف domain الجديد
```

### 🔴 G2Bulk لا يتصل / رصيد الـ Wallet لا يظهر

```
الحل:
  1. تحقق من supabase secrets set G2BULK_API_KEY="..."
  2. أعد نشر Function: supabase functions deploy g2bulk
  3. Admin → Developer tab → Test G2Bulk connection
```

---

## 16. الترتيب الزمني المثالي

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  اليوم الأول — الأساس المحلي
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  □ تثبيت Node.js + Git + Supabase CLI
  □ نسخ الكود: robocopy
  □ npm install
  □ إنشاء Supabase project
  □ تشغيل supabase_echocore_full.sql
  □ إنشاء .env وإضافة Supabase keys
  □ npm run dev → تحقق من الاتصال
  □ تعديل package.json + index.html + logo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  اليوم الثاني — النشر والـ APIs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  □ إنشاء GitHub repo
  □ git init + git push
  □ إضافة GitHub Secrets (4 values)
  □ تفعيل GitHub Pages (Actions)
  □ نشر Edge Functions (6 functions)
  □ إضافة Supabase Secrets (G2Bulk + Sam)
  □ ضبط Supabase Auth URLs
  □ إعداد Google OAuth جديد
  □ أول deployment ناجح ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  اليوم الثالث — التخصيص والإطلاق
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  □ ربط Domain الخاص (اختياري)
  □ إضافة Admin user (UPDATE profiles)
  □ Admin → IGDB credentials
  □ رفع صور الألعاب (npm run upload:game-logos)
  □ Cron Job للمزامنة التلقائية
  □ اختبار شامل لكل الوظائف
  □ 🚀 إطلاق!
```

---

> **تذكير:** المشروع الأصلي `echocore-store` لن يُمس في أي مرحلة من هذه العملية.  
> كل العمل يتم في مجلد جديد منفصل تماماً.

---

*آخر تحديث: يوليو 2026*
