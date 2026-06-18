import React from 'react';

export default function HowItWorksView({ t = {}, lang = 'en' }) {
  const isAr = lang === 'ar';

  const steps = [
    {
      number: '01',
      title: isAr ? 'اختر لعبتك' : 'Choose Your Game',
      desc: isAr 
        ? 'تصفح قائمة الألعاب المتاحة (Valorant, Mobile Legends, League of Legends وغيرها) واضغط على اللعبة التي تريدها.'
        : 'Browse our available games (Valorant, Mobile Legends, League of Legends and more) and click the one you want.'
    },
    {
      number: '02',
      title: isAr ? 'اختر العرض المناسب' : 'Select an Offer',
      desc: isAr 
        ? 'شاهد جميع العروض المتاحة للعبة، بما في ذلك العروض الخاصة والخصومات. اختر الكمية أو الباقة التي تناسبك.'
        : 'See all available offers for the game, including special deals and discounts. Pick the amount or pack that suits you.'
    },
    {
      number: '03',
      title: isAr ? 'أضف إلى السلة وادفع' : 'Add to Cart & Checkout',
      desc: isAr 
        ? 'أضف العرض إلى سلة التسوق، ثم انتقل إلى الدفع. ندعم شام كاش، بايننس باي (USDT)، والبطاقات الائتمانية.'
        : 'Add the offer to your cart, then proceed to checkout. We support ShamCash, Binance Pay (USDT), and credit cards.'
    },
    {
      number: '04',
      title: isAr ? 'استلم الكود فوراً' : 'Receive Your Code Instantly',
      desc: isAr 
        ? 'بعد تأكيد الدفع، سيصلك الكود فوراً عبر البريد الإلكتروني ويظهر أيضاً في حسابك على الموقع. استخدمه داخل اللعبة مباشرة.'
        : 'Once payment is confirmed, you receive the code instantly via email and it also appears in your account. Redeem it directly in-game.'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-black mb-3">
          {t.howItWorks || (isAr ? 'كيف يعمل المتجر؟' : 'How It Works')}
        </h1>
        <p className="text-[var(--text-secondary)] max-w-md mx-auto">
          {t.howSubtitle || (isAr 
            ? 'عملية بسيطة وسريعة في 4 خطوات فقط لتحصل على شحن ألعابك فوراً' 
            : 'A simple and fast process in just 4 steps to get your game top-ups instantly')}
        </p>
      </div>

      <div className="space-y-6">
        {steps.map((step, index) => (
          <div key={index} className="card p-6 flex gap-6 items-start">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center text-2xl font-black">
              {step.number}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-xl mb-2">{step.title}</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 card p-6 bg-[var(--bg-surface)] text-center">
        <div className="text-2xl mb-2">⚡</div>
        <h3 className="font-semibold text-lg mb-2">
          {t.instantDelivery100 || (isAr ? 'تسليم فوري 100%' : '100% Instant Delivery')}
        </h3>
        <p className="text-[var(--text-secondary)] text-sm max-w-md mx-auto">
          {t.guaranteeNote || (isAr 
            ? 'نحن نضمن وصول الكود خلال ثوانٍ بعد الدفع. في حال وجود أي مشكلة، فريق الدعم جاهز للمساعدة فوراً.'
            : 'We guarantee code delivery within seconds after payment. If you face any issue, our support team is ready to help immediately.')}
        </p>
      </div>
    </div>
  );
}
