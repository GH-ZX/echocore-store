import LegalPageView from './LegalPageView';
import { APP_VERSION, DEVELOPER, JURISDICTION, OPERATOR } from '../lib/buildInfo';
import { formatMessage, getT } from '../lib/i18n';

export default function TermsView({ lang = 'ar', t: tProp }) {
  const t = tProp || getT(lang);
  const isAr = lang === 'ar';

  const sections = [
    ...t.termsSectionsBase,
    {
      heading: t.termsOperatorHeading,
      body: [
        formatMessage(t.termsOperatorBody1, {
          operator: isAr ? OPERATOR.nameAr : OPERATOR.name,
        }),
        formatMessage(t.termsOperatorBody2, {
          developer: isAr ? DEVELOPER.nameAr : DEVELOPER.name,
          telegram: DEVELOPER.telegram,
          email: DEVELOPER.email,
          version: APP_VERSION,
        }),
      ],
    },
    {
      heading: t.termsGoverningLawHeading,
      body: [
        formatMessage(t.termsGoverningLawBody, {
          country: isAr ? JURISDICTION.countryAr : JURISDICTION.country,
        }),
      ],
    },
  ];

  return (
    <LegalPageView
      t={t}
      title={t.termsTitle}
      sections={sections}
    />
  );
}