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

**أوامر:** `npm run dev` · `npm run build` · `npm run lint` · `npm run preview`

---

## البنية

```
main.jsx              → BrowserRouter، تخزين الثيم
App.jsx               → الحالة العامة، Supabase، Header/Footer، النوافذ
components/routing/
  AppRoutes.jsx       → كل المسارات
  ProtectedRoute.jsx  → حماية المسارات؛ التحميل عبر t.loading
data/
  translations.js     → نصوص الواجهة (ar/en) + دمج pageContent
  pageContent.js      → أسئلة شائعة، قانوني، تذييل، خطوات الشحن حسب اللعبة
lib/
  i18n.js             → getT() و formatMessage()
  gameDescriptions.js → وصف تسويقي للألعاب + قالب {game} و {currency}
  offerDescriptions.js→ وصف العروض + قالب {gameName} و {offerName} و {region}
  redeemInstructions.js → يقرأ خطوات الشحن من pageContent
  invoiceBuilder.js   → بناء بيانات الفاتورة
  invoices.js         → جلب الفاتورة والصلاحيات
  invoiceDownload.js  → تنزيل PNG و PDF
components/invoices/
  InvoiceDocument.jsx → تخطيط الإيصال
views/
  OfferDetail.jsx     → صفحة تفاصيل الباقة
  InvoiceView.jsx     → /invoice/:kind/:id
  TestViewReceipt.jsx → معاينة تجريبية (تطوير فقط)
```

**المعايير:** `.grok/skills/echocore-standards/` — استخدم `t.key` و `formatMessage()` فقط، بدون نصوص ثنائية داخل المكوّنات.

**نصوص الزبون:** `brandUserText()` يخفي اسم المورّد من واجهة المتجر. مصطلحات G2Bulk للإدارة فقط.

**التسعير:** `g2bulk_cost_usd` = تكلفة المورد · `offer.price` = سعر الزبون (هامش + charm). الإدارة ترى التكلفة عبر `AdminOfferCostBadge`.

---

## الترجمة والوصف الافتراضي

| الملف | الاستخدام |
|-------|-----------|
| `translations.js` | أزرار، تسميات، إشعارات، فواتير، تبويبات الإدارة |
| `pageContent.js` | FAQ، قانوني، تذييل، **redeemSteps** و **topupInvoiceSteps** |

**وصف اللعبة الافتراضي:** `gameDescriptionFallback` — `{game}` و `{currency}`.

**وصف العرض الافتراضي:** `offerDescriptionFallback` (وما يعادله لـ UID أو كود الشحن). إذا كان الوصف فارغاً أو مكرراً من المزامنة يُستخدم القالب. يمكن للإدارة كتابة `{gameName}` و `{offerName}` و `{region}` في الوصف المخصص.

**مصطلحات الزبون:** **كود شحن** — وليس «استرداد» في سياق الشحن.

---

## المسارات

| المسار | الصفحة | ملاحظات |
|--------|--------|---------|
| `/` | الرئيسية | أقسام قابلة للتخصيص |
| `/games` `/gift-cards` `/accounts` `/search` `/sale` | الكتالوج | |
| `/game/:slug` | تفاصيل لعبة | شبكة الباقات |
| `/game/:gameSlug/:offerSlug` | تفاصيل عرض | مع لوحة الشراء |
| `/game/.../buy` | شراء | محمية |
| `/cart` `/checkout` `/recharge` | سلة ودفع وشحن | محمية |
| `/success` | نجاح الطلب | إيصال وأكواد |
| `/invoice/:kind/:id` | فاتورة | محمية · `order` أو `recharge` |
| `/profile` `/notifications` | الملف والإشعارات | |
| `/dashboard/*` | لوحة الإدارة | مسؤول فقط |
| `/faq` `/how` `/contact` `/privacy` `/terms` | صفحات ثابتة | |
| `/links` `/developer` | روابط ومطوّر | |
| `/dev/receipt-preview` | معاينة فاتورة | **تطوير فقط** |

التفاصيل الكاملة في `AppRoutes.jsx`.

---

## الفواتير

- **فاتورة شراء:** أكواد الشحن، بيانات UID، خطوات التفعيل حسب اللعبة.
- **فاتورة شحن رصيد:** مبلغ ShamCash والرصيد بعد الشحن.
- **الوصول:** صاحب الطلب أو الإدارة — من النجاح، الملف، الإشعارات، لوحة الطلبات.
- **التنزيل:** PNG و PDF (لقطة شاشة داخل A4).
- **التاريخ:** `YYYY/MM/DD`.

---

## قاعدة البيانات

**إعداد قاعدة البيانات:** [supabase_echocore_full.sql](./supabase_echocore_full.sql)

[دليل Supabase بالعربية](./SUPABASE_SETUP.ar.md) · [English](./SUPABASE_SETUP.md)

---

## لوحة الإدارة

نظرة عامة · **العروض** · الطلبات · الشحن · الدفع · الثيم · تخطيط الرئيسية · المراجعات · G2Bulk · أدوات التطوير

تعديل الألعاب والعروض عبر `AdminGameEditModal` و `AdminOfferEditModal` فقط.

---

## النشر

- أسرار GitHub: Supabase + `VITE_SITE_DOMAIN=www.echocore412.com` + `VITE_BASE_PATH=/`
- روابط Auth في Supabase تطابق النطاق
- تشغيل SQL الكامل على المشروع
- `role = admin` في `profiles`
- G2Bulk: مفتاح API، هامش الربح، أسعار Charm

---

## روابط التطوير المحلي

| الرابط | الغرض |
|--------|--------|
| http://localhost:5173 | المتجر |
| http://localhost:5173/dev/receipt-preview | معاينة شكل الفاتورة |

النسخة الإنجليزية: [PROJECT_MAP.md](./PROJECT_MAP.md)