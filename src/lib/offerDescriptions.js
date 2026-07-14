import { brandUserText } from './branding';
import { formatMessage } from './i18n';
import { getGameDisplayName, getOfferDisplayName } from './offerDisplay';
import { getFulfillmentGameForOffer } from './gameRegions';

const GENERIC_SYNC_PREFIX = /^instant\s+.+\s+top-up/i;

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function readDbOfferDescription(offer, lang = 'ar') {
  const raw = lang === 'ar'
    ? (offer?.description_ar || offer?.description_en)
    : (offer?.description_en || offer?.description_ar);
  return String(raw || '').trim();
}

function isGenericSyncedDescription(value = '') {
  const text = String(value || '').trim();
  if (!text) return true;
  if (GENERIC_SYNC_PREFIX.test(text)) return true;
  if (/^instant\s+.+\s+via\s+echocore\.?$/i.test(text)) return true;
  return false;
}

function collectComparableNames(offer, lang, context = {}) {
  const { game, games = [], relatedOffers = [] } = context;
  const fulfillmentGame = game || getFulfillmentGameForOffer(offer, games);
  const displayName = getOfferDisplayName(offer, lang, {
    game: fulfillmentGame,
    games,
    relatedOffers,
  });

  return [
    offer?.name_ar,
    offer?.name_en,
    offer?.g2bulk_catalogue_name,
    displayName,
  ]
    .filter(Boolean)
    .map(normalizeText);
}

function isRedundantOfferDescription(offer, description, lang, context) {
  const normalized = normalizeText(description);
  if (!normalized) return true;
  if (isGenericSyncedDescription(description)) return true;

  const names = collectComparableNames(offer, lang, context);
  return names.some((name) => (
    normalized === name
    || normalized.includes(name)
    || name.includes(normalized)
  ));
}

function buildDescriptionVars(offer, lang, context = {}) {
  const { game, games = [], relatedOffers = [] } = context;
  const fulfillmentGame = game || getFulfillmentGameForOffer(offer, games);
  const gameName = getGameDisplayName(fulfillmentGame, lang);
  const offerName = getOfferDisplayName(offer, lang, {
    game: fulfillmentGame,
    games,
    relatedOffers,
  });
  const region = String(offer?.region || fulfillmentGame?.region_label || '').trim();

  return {
    gameName,
    offerName,
    game: gameName,
    offer: offerName,
    region,
  };
}

function pickFallbackTemplate(game, t) {
  if (!t) return '';
  if (game?.redemption_method === 'uid') return t.offerDescriptionFallbackUid;
  if (game?.redemption_method === 'redeem_code') return t.offerDescriptionFallbackCode;
  return t.offerDescriptionFallback;
}

export function getOfferDescription(offer, lang = 'ar', context = {}, t = null) {
  if (!offer) return '';

  const vars = buildDescriptionVars(offer, lang, context);
  const fromDb = readDbOfferDescription(offer, lang);

  if (fromDb && !isRedundantOfferDescription(offer, fromDb, lang, context)) {
    return brandUserText(formatMessage(fromDb, vars));
  }

  const { game, games = [] } = context;
  const fulfillmentGame = game || getFulfillmentGameForOffer(offer, games);
  const template = pickFallbackTemplate(fulfillmentGame, t);
  if (!template) return '';

  return brandUserText(formatMessage(template, vars));
}