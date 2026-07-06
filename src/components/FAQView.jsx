import React, { useState } from 'react';

export default function FAQView({ t = {}, lang = 'en' }) {
  const isAr = lang === 'ar';

  const faqs = [
    {
      q: isAr ? 'كيف أحصل على الكود بعد الشراء؟' : 'How do I receive my code after purchase?',
      a: isAr 
        ? 'يتم إرسال الكود فوراً إلى بريدك الإلكتروني ويظهر في حسابك داخل الموقع بعد إتمام الدفع بنجاح.'
        : 'The code is sent instantly to your email and appears in your account on the site after successful payment.'
    },
    {
      q: isAr ? 'هل التسليم فوري؟' : 'Is delivery instant?',
      a: isAr 
        ? 'نعم، معظم الشحنات والكروت تُسلم في ثوانٍ معدودة بعد تأكيد الدفع.'
        : 'Yes, most top-ups and gift cards are delivered within seconds after payment confirmation.'
    },
    {
      q: isAr ? 'ما هي طرق الدفع المتاحة؟' : 'What payment methods are available?',
      a: isAr 
        ? 'ندعم الدفع عبر شام كاش والرصيد. بايننس باي والبطاقات الائتمانية قريباً.'
        : 'We support ShamCash and account balance. Binance Pay and cards are coming soon.'
    },
    {
      q: isAr ? 'هل يمكنني استخدام الكود على أي حساب؟' : 'Can I use the code on any account?',
      a: isAr 
        ? 'نعم، الكودات تعمل على الحسابات العالمية أو حسب المنطقة المحددة في وصف العرض.'
        : 'Yes, codes work on global or region-specific accounts as specified in the offer description.'
    },
    {
      q: isAr ? 'ماذا لو لم يصلني الكود؟' : 'What if I don’t receive my code?',
      a: isAr 
        ? 'تواصل معنا فوراً عبر الدعم أو الديسكورد. سنقوم بحل المشكلة خلال دقائق.'
        : 'Contact us immediately via support or Discord. We’ll resolve it within minutes.'
    },
    {
      q: isAr ? 'هل بياناتي آمنة؟' : 'Is my data secure?',
      a: isAr 
        ? 'نعم، نستخدم تشفير قوي ولا نخزن بيانات الدفع. الدفع يتم عبر بوابات موثوقة.'
        : 'Yes, we use strong encryption and do not store payment data. Payments go through trusted gateways.'
    },
    {
      q: isAr ? 'هل يوجد دعم باللغة العربية؟' : 'Is there Arabic support?',
      a: isAr 
        ? 'بالتأكيد! فريق الدعم متاح بالعربية والإنجليزية على مدار الساعة.'
        : 'Absolutely! Our support team is available in Arabic and English 24/7.'
    },
  ];

  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10 md:mb-12">
        <h1 className="section-heading text-3xl md:text-4xl font-black mb-3">
          {t.faq || (isAr ? 'الأسئلة الشائعة' : 'Frequently asked questions')}
        </h1>
        <p className="section-subheading text-sm md:text-base">
          {t.faqSubtitle || (isAr 
            ? 'إجابات سريعة حول الشراء والتسليم والدفع في ECHOCORE' 
            : 'Quick answers about buying, delivery, and payments at ECHOCORE')}
        </p>
      </div>

      <div className="space-y-2.5">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div 
              key={index}
              className={`card overflow-hidden transition-colors duration-200 ${isOpen ? 'border-[color-mix(in_srgb,var(--accent)_35%,var(--border))]' : ''}`}
            >
              <button
                type="button"
                onClick={() => toggle(index)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 p-4 sm:p-5 text-left hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
              >
                <span className="font-semibold text-sm sm:text-base leading-snug">{faq.q}</span>
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] text-lg leading-none transition-all duration-200 ${isOpen ? 'rotate-45 border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : ''}`}
                >
                  +
                </span>
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-[var(--text-secondary)] border-t border-[var(--border)] pt-3 sm:pt-4 text-sm leading-relaxed max-w-[65ch]">
                    {faq.a}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 text-center p-6 card">
        <p className="text-sm mb-3 text-[var(--text-sec)]">
          {t.didntFind || (isAr 
            ? 'لم تجد إجابتك؟' 
            : "Didn't find your answer?")}
        </p>
        <a 
          href="mailto:support@echocore.store" 
          className="btn btn-primary inline-flex items-center"
        >
          {t.contactSupport || (isAr ? 'تواصل مع الدعم' : 'Contact Support')}
        </a>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {t.orDiscord || (isAr ? 'أو انضم إلى سيرفر الديسكورد' : 'Or join our Discord server')}
        </p>
      </div>
    </div>
  );
}
