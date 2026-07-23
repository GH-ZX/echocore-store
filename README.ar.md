# ECHOCORE Store — متجر ألعاب رقمي

**المباشر:** https://www.echocore412.com  
**الإصدار:** 0.5.0

متجر شحن ألعاب وبطاقات رقمية (عربي / إنجليزي).  
React + Supabase + GitHub Pages.

**الترخيص:** ملكية خاصة — جميع الحقوق محفوظة. الكود منشور للعرض فقط. راجع [LICENSE](./LICENSE).

**English:** [README.md](./README.md)

---

## الوثائق (ببساطة)

👉 **[docs/README.md](./docs/README.md)** — صفحة واحدة تشير لكل شيء  

صاحب المتجر: [docs/for-owners.md](./docs/for-owners.md) · [تقرير المالك](./تقرير-تطوير-الموقع-للمالك.txt)

---

## الميزات

- قاعدة بيانات Supabase (ألعاب، عروض، طلبات، مصادقة، رصيد)
- لوحة إدارة (`/dashboard`)
- مزامنة G2Bulk وتوريد تلقائي
- شحن وشراء ShamCash / Sam API
- فواتير طلبات ورصيد
- عربي / إنجليزي
- نطاق مخصص على GitHub Pages

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

### قاعدة البيانات (مشروع جديد)

في Supabase **SQL Editor** شغّل **ملف واحد فقط**:

👉 [supabase_echocore_full.sql](./supabase_echocore_full.sql)

ثم عيّن `role = admin` في `profiles`.

كل المخطط في هذا الملف الواحد (تم دمج الترحيلات السابقة فيه).

---

## الأوامر

| الأمر | الوصف |
|------|--------|
| `npm run dev` | تطوير |
| `npm run build` | بناء للإنتاج |
| `npm run lint` | فحص الكود |
| `npm run preview` | معاينة البناء |

---

© 2026 ECHOCORE Store. جميع الحقوق محفوظة.
