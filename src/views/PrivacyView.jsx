import LegalPageView from './LegalPageView';
import { getT } from '../lib/i18n';

export default function PrivacyView({ lang = 'ar', t: tProp }) {
  const t = tProp || getT(lang);

  return (
    <LegalPageView
      t={t}
      title={t.privacyTitle}
      sections={t.privacySections}
    />
  );
}