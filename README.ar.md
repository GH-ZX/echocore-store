# ECHOCORE Store — متجر ألعاب رقمي

**المباشر:** https://www.echocore412.com  
**الإصدار:** 0.5.0

متجر شحن ألعاب وبطاقات رقمية (عربي / إنجليزي). React + Supabase + GitHub Pages.

**الترخيص:** ملكية خاصة — جميع الحقوق محفوظة. الكود منشور للعرض فقط وليس للاستخدام أو النسخ. راجع [LICENSE](./LICENSE).

English: [README.md](./README.md)

---

## الميزات

- قاعدة بيانات Supabase (ألعاب، عروض، طلبات، مصادقة، رصيد)
- لوحة إدارة (`/dashboard`) — كتالوج، دفع، ثيم، تخطيط الرئيسية، G2Bulk
- شحن وشراء ShamCash يدوي (موافقة الإدارة)
- ترجمة مركزية (`translations.js` / `pageContent.js`)
- نطاق مخصص على GitHub Pages

**إعداد قاعدة البيانات:** [SUPABASE_SETUP.ar.md](./SUPABASE_SETUP.ar.md)

---

## التشغيل السريع

```bash
git clone https://github.com/GH-ZX/echocore-store.git
cd echocore-store
npm install
cp .env.example .env
npm run dev
```

افتح http://localhost:5173

### Supabase (ملف SQL واحد)

في **SQL Editor** شغّل:

👉 [supabase_echocore_full.sql](./supabase_echocore_full.sql)

ثم عيّن `role = admin` في جدول `profiles`.

---

## الأوامر

| الأمر | الوصف |
|-------|--------|
| `npm run dev` | بيئة التطوير |
| `npm run build` | بناء الإنتاج |
| `npm run lint` | فحص ESLint |
| `npm run preview` | معاينة البناء |

---

## النشر

الدفع إلى `main` يشغّل GitHub Actions (lint + build + نشر).

**الأسرار المطلوبة:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_DOMAIN` (`www.echocore412.com`), `VITE_BASE_PATH` (`/`).

التفاصيل: [RUNNING.md](./RUNNING.md) · [PROJECT_MAP.ar.md](./PROJECT_MAP.ar.md)

---

## هيكل المشروع

```
src/
├── App.jsx
├── components/routing/     # AppRoutes والمسارات
├── views/
├── data/                   # الترجمات والمحتوى
└── lib/
supabase_echocore_full.sql  # إعداد قاعدة البيانات — شغّل هذا
```

---

## الوثائق

| الملف | اللغة |
|------|--------|
| [SUPABASE_SETUP.ar.md](./SUPABASE_SETUP.ar.md) | عربي |
| [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) | إنجليزي |
| [PROJECT_MAP.ar.md](./PROJECT_MAP.ar.md) | عربي |
| [PROJECT_MAP.md](./PROJECT_MAP.md) | إنجليزي |
| [RUNNING.md](./RUNNING.md) | عربي |

---

© 2026 متجر ECHOCORE. جميع الحقوق محفوظة. · المطوّر: [أحمد غاوي](https://github.com/GH-ZX) · ahmedghuwu3@gmail.com