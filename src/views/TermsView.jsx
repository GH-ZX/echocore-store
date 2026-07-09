import LegalPageView from './LegalPageView';

export default function TermsView({ lang = 'ar' }) {
  const isAr = lang === 'ar';

  const sections = isAr
    ? [
        {
          heading: 'قبول الشروط',
          body: [
            'باستخدام ECHOCORE Store فإنك توافق على هذه الشروط. إذا لم توافق، يرجى عدم استخدام الموقع.',
          ],
        },
        {
          heading: 'المنتجات الرقمية',
          body: [
            'جميع العروض سلع رقمية (شحن، نقاط، أكواد). التسليم يتم بعد تأكيد الدفع وفق طريقة الاسترداد الخاصة بكل لعبة.',
            'أنت مسؤول عن إدخال معرف اللاعب (UID) والسيرفر الصحيح عند الطلب.',
          ],
        },
        {
          heading: 'الدفع والاسترداد',
          body: [
            'الأسعار معروضة بالدولار ما لم يُذكر خلاف ذلك. الرصيد المحفوظ في حسابك يُستخدم للشراء داخل المتجر.',
            'بسبب طبيعة المنتجات الرقمية، الاسترداد متاح فقط في حالات الخطأ المؤكد من طرفنا أو فشل التسليم.',
          ],
        },
        {
          heading: 'حسابك',
          body: [
            'أنت مسؤول عن حماية بيانات دخولك. يُحظر استغلال الثغرات أو التلاعب بالأسعار أو الرصيد.',
            'يجوز لنا تعليق الحسابات المخالفة.',
          ],
        },
      ]
    : [
        {
          heading: 'Acceptance',
          body: [
            'By using ECHOCORE Store you agree to these terms. If you do not agree, please do not use the site.',
          ],
        },
        {
          heading: 'Digital goods',
          body: [
            'All offers are digital goods (top-ups, points, codes). Delivery occurs after payment confirmation per each game’s redemption method.',
            'You are responsible for entering the correct player UID and server when required.',
          ],
        },
        {
          heading: 'Payments & refunds',
          body: [
            'Prices are shown in USD unless stated otherwise. Account balance can be used for in-store purchases.',
            'Because products are digital, refunds apply only when we confirm an error on our side or failed delivery.',
          ],
        },
        {
          heading: 'Your account',
          body: [
            'You are responsible for keeping your login secure. Exploiting bugs or manipulating prices or balance is prohibited.',
            'We may suspend accounts that violate these terms.',
          ],
        },
      ];

  return (
    <LegalPageView
      lang={lang}
      title={isAr ? 'شروط الخدمة' : 'Terms of Service'}
      sections={sections}
    />
  );
}