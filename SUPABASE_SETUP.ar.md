# ECHOCORE — دليل إعداد Supabase

**الموقع المباشر:** https://www.echocore412.com  
**إصدار التطبيق:** 0.5.0

يشرح هذا الدليل ربط مشروع ECHOCORE Store (مصادقة، كتالوج، طلبات، رصيد، لوحة إدارة) بـ Supabase.

---

## المسار السريع (موصى به)

### 1. إنشاء مشروع Supabase

1. أنشئ مشروعاً على [supabase.com](https://supabase.com).
2. من **Project Settings → API** انسخ:
   - **Project URL** → `VITE_SUPABASE_URL`
   - مفتاح **anon public** → `VITE_SUPABASE_ANON_KEY`

3. محلياً:
   ```bash
   cp .env.example .env
   ```
   والصق القيمتين.

### 2. قاعدة البيانات (ملف واحد)

افتح **SQL Editor** وشغّل الملف كاملاً:

👉 **[supabase_echocore_full.sql](./supabase_echocore_full.sql)**

الملف آمن للتكرار (`IF NOT EXISTS`، `CREATE OR REPLACE`):

| الحالة | ماذا تفعل |
|--------|-----------|
| **مشروع جديد** | شغّل الملف كاملاً مرة واحدة (§01–§15). |
| **مشروع ECHOCORE قديم** | أعد التشغيل لتطبيق أي ترحيلات ناقصة. |
| **الانتقال لمشروع Supabase آخر** | مشروع جديد + الملف الكامل + تحديث الأسرار (انظر § النقل). |

**لا** تشغّل القسمين الاختياريين §A و §B في الإنتاج (يمسحان البيانات).

### 3. إعدادات المصادقة (Auth)

في **Authentication → URL configuration** (الإنتاج):

| الحقل | القيمة |
|-------|--------|
| Site URL | `https://www.echocore412.com` |
| Redirect URLs | `https://www.echocore412.com/login` |
| | `https://www.echocore412.com/**` |
| | `http://localhost:5173/login` |

### 4. التخزين (Storage)

تأكد من وجود bucket **`product-images`** وأنه **عام** (يُنشأ عبر SQL).

### 5. أول مسؤول

1. سجّل حساباً على الموقع أو محلياً.
2. في **Table Editor → `profiles`** غيّر `role` إلى `admin`.

### 6. الدفع والشحن

**الإدارة → طرق الدفع:** ارفع QR لـ ShamCash، أدخل رمز الدفع، احفظ.  
**الإدارة → طلبات الشحن:** وافق على الشحن بعد التحقق من الدفع.

---

## أسرار النشر على GitHub Pages

في المستودع **Settings → Secrets and variables → Actions**:

| السر | مثال |
|------|------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | مفتاح anon |
| `VITE_SITE_DOMAIN` | `www.echocore412.com` |
| `VITE_BASE_PATH` | `/` |

الـ workflow يشغّل lint + build ويكتب `CNAME` عند تعيين `VITE_SITE_DOMAIN`.

**لا** تضف `G2BULK_API_KEY` أو `service_role` أو `VITE_MOCK_FULFILLMENT=true` لبناء الإنتاج.

---

## النقل إلى مشروع Supabase آخر

استخدم **نفس** ملف `supabase_echocore_full.sql` على المشروع الجديد:

1. مشروع Supabase جديد → شغّل §01–§15.
2. اضبط روابط Auth (الجدول أعلاه).
3. حدّث أسرار GitHub Actions.
4. **أسرار Edge Functions:** أعد إدخال `G2BULK_API_KEY` وأسرار cron — لا تُخزَّن في الواجهة.
5. **Storage:** أعد رفع `product-images` إن لزم.
6. **المستخدمون:** إعادة تسجيل أو استعادة من نسخة Supاحة (متقدم).

---

## قائمة أمان الإنتاج

قبل قبول مدفوعات حقيقية:

- [ ] تطبيق `supabase_echocore_full.sql`
- [ ] مستخدم **غير مسؤول**: `SELECT * FROM orders` يعرض طلباته فقط
- [ ] `get_payment_methods` لا يكشف توكن ShamCash API
- [ ] `store_settings` للمسؤولين فقط (RLS)
- [ ] `VITE_MOCK_FULFILLMENT` غير مفعّل في CI للإنتاج

النسخة الإنجليزية: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

---

## ملف SQL

| الملف | الغرض |
|------|--------|
| `supabase_echocore_full.sql` | **الإعداد الأساسي** — المخطط الكامل (~3000 سطر) |
| `supabase_charm_pricing_migration.sql` | ترقية تدريجية: تفعيل أسعار Charm (قواعد قديمة فقط) |
| `supabase_*.sql` | ترقيات أخرى — راجع [ECHOCORE_STORE_GUIDE.md §13](./ECHOCORE_STORE_GUIDE.md#13-sql-migrations) |
| `scripts/*.sql` | تشخيص / عمليات اختيارية |

---

## G2Bulk (Edge Functions)

```bash
supabase secrets set G2BULK_API_KEY=your_key_here
supabase functions deploy g2bulk
```

قاعدة قديمة بدون عمود charm؟ شغّل `supabase_charm_pricing_migration.sql`.

## خطوات اختيارية

- Sam API: `supabase functions deploy sam-api`
- النطاق المخصص: `www.echocore412.com`
- الإشعارات: مدمجة في الملف الكامل (v1–v3)

بعد ذلك يصبح المتجر مربوطاً بقاعدة بيانات حقيقية على Supabase.