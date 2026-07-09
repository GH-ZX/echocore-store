import LegalPageView from './LegalPageView';

export default function PrivacyView({ lang = 'ar' }) {
  const isAr = lang === 'ar';

  const sections = isAr
    ? [
        {
          heading: 'البيانات التي نجمعها',
          body: [
            'نجمع بريدك الإلكتروني واسم العرض عند التسجيل، وسجل الطلبات والمعاملات اللازمة لتشغيل المتجر.',
            'لا نخزن كلمات المرور — تتم إدارتها عبر مزود المصادقة (Supabase).',
          ],
        },
        {
          heading: 'كيف نستخدم بياناتك',
          body: [
            'نستخدم بياناتك لإتمام الطلبات، وإدارة رصيدك، والرد على استفسارات الدعم.',
            'لا نبيع بياناتك الشخصية لأطراف ثالثة.',
          ],
        },
        {
          heading: 'الأمان والاحتفاظ',
          body: [
            'نتواصل مع قاعدة البيانات عبر اتصالات مشفرة. يمكنك طلب تحديث اسم العرض من صفحة الملف الشخصي.',
            'نحتفظ بسجلات الطلبات للامتثال والدعم ما دام حسابك نشطاً.',
          ],
        },
        {
          heading: 'تواصل معنا',
          body: [
            'لأي استفسار حول الخصوصية، راسلنا عبر صفحة اتصل بنا أو قنوات الدعم الرسمية.',
          ],
        },
      ]
    : [
        {
          heading: 'Data we collect',
          body: [
            'We collect your email and display name when you register, plus order and transaction records required to run the store.',
            'We do not store passwords — authentication is handled by Supabase.',
          ],
        },
        {
          heading: 'How we use your data',
          body: [
            'We use your information to fulfill orders, manage your balance, and respond to support requests.',
            'We do not sell your personal data to third parties.',
          ],
        },
        {
          heading: 'Security & retention',
          body: [
            'Database communication uses encrypted connections. You can update your display name from the profile page.',
            'We retain order history for support and compliance while your account remains active.',
          ],
        },
        {
          heading: 'Contact',
          body: [
            'For privacy questions, reach us through the Contact page or our official support channels.',
          ],
        },
      ];

  return (
    <LegalPageView
      lang={lang}
      title={isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
      sections={sections}
    />
  );
}