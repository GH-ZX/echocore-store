تشغيل المشروع (ECHOCORE Store)

المتطلبات المسبقة
- Node.js (يوصى بالإصدار 18 أو أحدث)
- npm (يأتي مع Node.js)

التحضير والتشغيل محلياً
1. استنسخ المستودع:

   git clone <repo-url>
   cd echocore-store

2. ثبّت الحزم:

   npm install

3. شغّل بيئة التطوير (Vite):

   npm run dev

   ثم افتح المتصفح على: http://localhost:5173

البناء للبيئة الإنتاجية
- بناء الحزمة:

  npm run build

- معاينة مجسّدة من مخرجات البناء:

  npm run preview

ملاحظات مهمة
- ملفات البيئة: إذا احتجت متغيرات بيئة، ضعها في ملف `.env` ولكن لا ترفع هذا الملف إلى Git (موجود في `.gitignore`).
- الأصول: ضع شعارات الألعاب والـ covers داخل `src/assets` بالصيغة التالية:
  - valorant-logo.png
  - lol-logo.png
  - xbox-logo.png
  - fortnite-logo.png
  - minecraft-logo.png
  - apex-legends-logo.png
  - call-of-duty-logo.png
  كما يوجد ملفان احتياطيان بالفعل: `placeholder-logo.png` و `placeholder-cover.png`.
- إضافة ألعاب وعروض: من لوحة الإدارة `/dashboard` (بعد تعيين `role = admin` في Supabase). الصور تُرفع إلى bucket `product-images`.

نصائح النشر
- النشر على **GitHub Pages** عبر `.github/workflows/deploy.yml` (يدفع تلقائياً عند push إلى `main`).
- للبناء المحلي: `npm run build` — الناتج في مجلد `dist/`.
- الرابط المباشر: https://gh-zx.github.io/echocore-store/

أوامر مفيدة
- `npm run dev` — تشغيل بيئة التطوير
- `npm run build` — بناء للإنتاج
- `npm run preview` — معاينة نتيجة البناء محلياً
- `npm run lint` — تشغيل ESLint

لتفاصيل النشر، راجع `.github/workflows/deploy.yml` و`vite.config.js` (base: `/echocore-store/`).