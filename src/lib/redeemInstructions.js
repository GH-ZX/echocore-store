import { getT } from './i18n';

function normalizeSlug(slug = '') {
  return String(slug).trim().toLowerCase();
}

export function getRedeemInstructions(slug, lang = 'ar') {
  const t = getT(lang);
  const key = normalizeSlug(slug);
  const steps = t.redeemSteps?.[key];
  if (steps?.length) return steps;
  return t.redeemStepsGeneric || [];
}

export function getTopupSteps(lang = 'ar') {
  const t = getT(lang);
  return t.topupInvoiceSteps || [];
}