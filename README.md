# ECHOCORE Store

متجر ألعاب وبطاقات رقمية حديث مبني بـ React و Vite، يوفر واجهة مستخدم سلسة وآمنة لشراء الألعاب والبطاقات الرقمية


لتصفح الموقع: https://echo-core-store.netlify.app/


## ✨ الميزات

- 🎮 **كاروسيل ألعاب متقدم** — عرض ديناميكي للألعاب الشهيرة (Valorant, League of Legends, إلخ)
- 🛒 **سلة تسوق كاملة** — إدارة المنتجات وعملية الدفع السلسة
- 👥 **نظام تسجيل دخول** — مستخدمين عاديين وإداريين
- 🎨 **واجهة عصرية** — مصممة بـ Tailwind CSS مع تأثيرات بصرية جذابة
- 🌍 **دعم متعدد اللغات** — عربي وإنجليزي
- ⚡ **بيئة تطوير سريعة** — Vite مع Hot Module Replacement (HMR)
- 📱 **متجاوب** — يعمل على الهاتف والويب والتابلت

## 📋 المتطلبات

- **Node.js** (إصدار 18 أو أحدث)
- **npm** (يأتي مع Node.js)

## 🚀 التثبيت والتشغيل

### 1. استنسخ المستودع

```bash
git clone https://github.com/GH-ZX/echocore-store.git
cd echocore-store
```

### 2. ثبّت الحزم

```bash
npm install
```

### 3. شغّل بيئة التطوير

```bash
npm run dev
```

افتح المتصفح على: **http://localhost:5173**

## 📦 البناء والنشر

### بناء للإنتاج

```bash
npm run build
```

### معاينة مجسّدة

```bash
npm run preview
```

## 🏗️ بنية المشروع

```
src/
├── App.jsx                 # مكون التطبيق الرئيسي
├── main.jsx               # نقطة الدخول
├── index.css              # الأنماط العامة
├── assets/                # الصور والشعارات
│   ├── valorant.png       # صورة العرض
│   ├── valorant-logo.png  # شعار اللعبة
│   ├── lol.png
│   ├── lol-logo.png
│   └── ...
├── components/            # مكونات React
│   ├── Header.jsx
│   ├── HomeView.jsx
│   ├── ProductCarousel.jsx # كاروسيل الألعاب الرئيسي
│   ├── CartView.jsx
│   ├── CheckoutView.jsx
│   └── ...
└── data/
    ├── mockProducts.js    # قاعدة بيانات المنتجات (نموذجية)
    └── translations.js    # نصوص التطبيق (عربي/إنجليزي)
```

## 🎮 المنتجات المدعومة

يدعم التطبيق حالياً الألعاب التالية:

- **Valorant** — لعبة أكشن تنافسية
- **League of Legends** — لعبة MOBA الشهيرة
- **Fortnite** — لعبة الساحة البقاء
- **Minecraft** — لعبة البناء والاستكشاف
- **Apex Legends** — لعبة Battle Royale
- **Call of Duty** — سلسلة الألعاب العسكرية
- Xbox Game Pass والمزيد...

## 🔧 أوامر مفيدة

| الأمر | الوصف |
|------|-------|
| `npm run dev` | تشغيل بيئة التطوير |
| `npm run build` | بناء للإنتاج |
| `npm run preview` | معاينة نسخة الإنتاج محلياً |
| `npm run lint` | تشغيل ESLint للتحقق من الكود |

## 🎨 التكنولوجيات المستخدمة

- **React 19** — مكتبة JavaScript لبناء الواجهات
- **Vite 8** — بيئة تطوير سريعة وحديثة
- **Tailwind CSS 4** — إطار عمل CSS حديث
- **Lucide React** — أيقونات جميلة وخفيفة الوزن
- **Embla Carousel** — كاروسيل احترافي وخفيف الأداء

## 📸 إضافة شعارات والصور

ضع ملفات الشعارات والصور في `src/assets/` بأسماء موحدة:

```
src/assets/
├── {game-name}-logo.png      # شعار اللعبة (يظهر في الأزرار)
├── {game-name}.png           # صورة الغلاف الكبيرة
└── placeholder-*.png         # صور احتياطية
```

**مثال:**
- `valorant-logo.png` — شعار Valorant الصغير
- `valorant.png` — صورة غلاف Valorant الكبيرة

## 📝 إضافة منتجات جديدة

عدّل `src/data/mockProducts.js` وأضف عنصر جديد:

```javascript
{
  id: 13,
  name_en: "Game Name",
  name_ar: "Game Name",  // الأسماء تبقى بالإنجليزية
  price: 9.99,
  category: "games",
  icon: "Gamepad2",
  color: "from-color-500 to-color-600",
  logoFile: "game-name-logo.png",
  coverFile: "game-name-cover.png"  // اختياري
}
```

## 🔐 أدوار المستخدمين

### مستخدم عادي
- استعراض الألعاب
- الشراء والدفع
- إدارة السلة

### المسؤول (Admin)
- إضافة/حذف المنتجات
- إدارة المتجر

**دخول تجريبي:**
- البريد: `admin@ex.com`
- كلمة المرور: `admin`

## 📄 الملفات المهمة

- [RUNNING.md](RUNNING.md) — تعليمات التشغيل التفصيلية
- [.gitignore](.gitignore) — إعدادات استبعاد Git
- [package.json](package.json) — الحزم والاعتمادات
- [tailwind.config.js](tailwind.config.js) — إعدادات Tailwind

## 🤝 المساهمة

نرحب بالمساهمات! يمكنك:

1. Fork المستودع
2. إنشاء فرع جديد (`git checkout -b feature/AmazingFeature`)
3. Commit التغييرات (`git commit -m 'Add AmazingFeature'`)
4. Push للفرع (`git push origin feature/AmazingFeature`)
5. فتح Pull Request

## 📜 الترخيص

هذا المشروع مرخص تحت [MIT License](LICENSE).

## 📧 التواصل

للأسئلة والاقتراحات، يمكنك التواصل معنا عبر:
- GitHub Issues
- البريد الإلكتروني: [أضف بريدك هنا]

---

مصنوع بـ ❤️ بواسطة ECHOCORE Team | © 2026

