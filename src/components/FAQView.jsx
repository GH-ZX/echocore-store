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
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-black mb-3">
          {t.faq || (isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions')}
        </h1>
        <p className="text-[var(--text-secondary)]">
          {t.faqSubtitle || (isAr 
            ? 'إجابات على أكثر الأسئلة شيوعاً حول متجر ECHOCORE' 
            : 'Answers to the most common questions about ECHOCORE Store')}
        </p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div 
              key={index}
              className="card overflow-hidden border border-[var(--border)]"
            >
              <button
                onClick={() => toggle(index)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors"
              >
                <span className="font-semibold text-base pr-4">{faq.q}</span>
                <span className={`text-xl transition-transform flex-shrink-0 ${isOpen ? 'rotate-45' : ''}`}>
                  +
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 text-[var(--text-secondary)] border-t border-[var(--border)] pt-4 text-sm leading-relaxed">
                  {faq.a}
                </div>
              )}
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
