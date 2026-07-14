const REDEEM_STEPS = {
  valorant: {
    ar: [
      'افتح متجر Valorant أو موقع Riot Games.',
      'سجّل الدخول بحسابك.',
      'اختر «استرداد الكود» أو Redeem Code.',
      'الصق الكود واضغط تأكيد.',
    ],
    en: [
      'Open the Valorant store or Riot Games website.',
      'Sign in to your account.',
      'Choose Redeem Code.',
      'Paste the code and confirm.',
    ],
  },
  'pubg-mobile': {
    ar: [
      'افتح PUBG Mobile.',
      'اذهب إلى المتجر ← Redeem.',
      'أدخل كود الشحن واضغط OK.',
    ],
    en: [
      'Open PUBG Mobile.',
      'Go to Shop → Redeem.',
      'Enter the code and tap OK.',
    ],
  },
  'mobile-legends': {
    ar: [
      'افتح Mobile Legends.',
      'اذهب إلى المتجر ← شحن.',
      'اختر «كود» وأدخل الكود.',
    ],
    en: [
      'Open Mobile Legends.',
      'Go to Shop → Recharge.',
      'Choose Code and enter your redeem code.',
    ],
  },
  steam: {
    ar: [
      'افتح Steam على الكمبيوتر أو الموقع.',
      'من القائمة: Games → Activate a Product on Steam.',
      'أدخل الكود واتبع الخطوات.',
    ],
    en: [
      'Open Steam on desktop or the website.',
      'Go to Games → Activate a Product on Steam.',
      'Enter the code and follow the prompts.',
    ],
  },
  xbox: {
    ar: [
      'افتح microsoft.com/redeem أو تطبيق Xbox.',
      'سجّل الدخول بحساب Microsoft.',
      'أدخل الكود واضغط التالي.',
    ],
    en: [
      'Open microsoft.com/redeem or the Xbox app.',
      'Sign in to your Microsoft account.',
      'Enter the code and continue.',
    ],
  },
  playstation: {
    ar: [
      'افتح PlayStation Store على الجهاز أو الموقع.',
      'اختر Redeem Codes.',
      'أدخل الكود واضغط تأكيد.',
    ],
    en: [
      'Open PlayStation Store on your device or browser.',
      'Select Redeem Codes.',
      'Enter the code and confirm.',
    ],
  },
};

function normalizeSlug(slug = '') {
  return String(slug).trim().toLowerCase();
}

export function getRedeemInstructions(slug, lang = 'ar') {
  const key = normalizeSlug(slug);
  const steps = REDEEM_STEPS[key]?.[lang] || REDEEM_STEPS[key]?.ar;
  if (steps?.length) return steps;

  return lang === 'ar'
    ? [
      'افتح اللعبة أو المنصة المرتبطة بالمنتج.',
      'ابحث عن خيار استرداد الكود / Redeem.',
      'أدخل الكود الظاهر في هذه الفاتورة بالضبط.',
      'احتفظ بهذه الفاتورة للرجوع إليها عند الحاجة.',
    ]
    : [
      'Open the game or platform linked to this product.',
      'Find the Redeem Code option.',
      'Enter the code shown on this invoice exactly.',
      'Keep this invoice for your records.',
    ];
}

export function getTopupSteps(lang = 'ar') {
  return lang === 'ar'
    ? [
      'تم تسجيل بيانات الحساب أدناه للتسليم المباشر.',
      'لا حاجة لنسخ كود — يُشحن الرصيد إلى UID/السيرفر المذكور.',
      'تحقق من مطابقة UID والسيرفر مع ما أدخلته عند الشراء.',
      'احتفظ بهذه الفاتورة للمراجعة عند أي استفسار.',
    ]
    : [
      'Account details below were submitted for direct top-up delivery.',
      'No redeem code is required — balance is sent to the UID/server listed.',
      'Verify the UID and server match what you entered at checkout.',
      'Keep this invoice for support if anything looks wrong.',
    ];
}