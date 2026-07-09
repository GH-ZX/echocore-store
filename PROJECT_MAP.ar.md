# ECHOCORE Store — خريطة المشروع

> اقرأ هذا أولاً للحصول على صورة كاملة في دقيقتين.

## ما هو المشروع؟

متجر **شحن ألعاب رقمي** ثنائي اللغة (العربية افتراضياً / إنجليزي). واجهة React مع **Supabase** (مصادقة، كتالوج، طلبات، رصيد، إدارة). الواجهة ثابتة على **GitHub Pages** مع نطاق مخصص.

**المباشر:** https://www.echocore412.com

---

## التقنيات

| الطبقة | الاختيار |
|--------|----------|
| الإطار | React 19 + Vite 8 |
| التوجيه | react-router-dom v7 (`AppRoutes.jsx`) |
| التنسيق | Tailwind CSS v4 |
| قاعدة البيانات | Supabase |
| الترجمة | `translations.js` + `pageContent.js` + `lib/i18n.js` |
| الحركة | framer-motion |
| النشر | GitHub Actions → GitHub Pages |

**متغيرات البيئة:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_DOMAIN`, `VITE_BASE_PATH`

**أوامر:** `npm run dev` · `npm run build` · `npm run lint`

---

## البنية

```
main.jsx              → BrowserRouter، تخزين الثيم
App.jsx               → الحالة العامة، Supabase، Header/Footer، النوافذ
components/routing/
  AppRoutes.jsx       → كل المسارات
  PageLoader.jsx      → تحميل كسول
  LangSwitchOverlay.jsx
data/translations.js  → نصوص الواجهة
data/pageContent.js   → محتوى الصفحات (أسئلة، قانوني)
```

**المعايير:** `.grok/skills/echocore-standards/` — استخدم `t.key` فقط، بدون نصوص ثنائية داخل المكوّنات.

---

## المسارات

| المسار | الصفحة |
|--------|--------|
| `/` | الرئيسية (أقسام قابلة للتخصيص) |
| `/games` `/gift-cards` `/accounts` `/search` `/sale` | الكتالوج |
| `/game/:slug` | تفاصيل لعبة |
| `/cart` `/checkout` `/recharge` | محمية (تسجيل دخول) |
| `/dashboard/*` | لوحة الإدارة |
| `/links` | روابط التواصل |
| `/developer` | صفحة المطوّر |

التفاصيل الكاملة في `AppRoutes.jsx`.

---

## قاعدة البيانات

**إعداد قاعدة البيانات:** [supabase_echocore_full.sql](./supabase_echocore_full.sql) (ملف واحد، ~2800 سطر)

[دليل Supabase بالعربية](./SUPABASE_SETUP.ar.md) · [English](./SUPABASE_SETUP.md)

---

## النشر

- أسرار GitHub: Supabase + `VITE_SITE_DOMAIN=www.echocore412.com` + `VITE_BASE_PATH=/`
- روابط Auth في Supabase تطابق النطاق
- تشغيل SQL الكامل على المشروع
- `role = admin` في `profiles`

النسخة الإنجليزية: [PROJECT_MAP.md](./PROJECT_MAP.md)