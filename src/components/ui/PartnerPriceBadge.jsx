import { formatPrice } from '../../lib/offerDisplay';
import { formatMessage } from '../../lib/i18n';

/**
 * Shows public vs partner/influencer price when offer was remapped.
 */
export default function PartnerPriceBadge({ offer, t = {}, size = 'sm' }) {
  const isPartner = !!offer?._partnerPriced;
  const isInfluencer = !!offer?._influencerPriced;
  if (!isPartner && !isInfluencer) return null;

  const publicPrice = Number(offer._publicPrice);
  const salePrice = Number(offer.price);
  if (!Number.isFinite(publicPrice) || !Number.isFinite(salePrice)) return null;
  if (publicPrice <= salePrice) return null;

  const text = size === 'lg' ? 'text-xs' : 'text-[10px]';
  const pad = size === 'lg' ? 'px-2 py-1' : 'px-1.5 py-0.5';
  const label = isPartner
    ? (t.partnerPriceBadge || 'Partner')
    : formatMessage(t.influencerPriceBadge || 'Code −{pct}%', {
      pct: offer._influencerDiscountPercent != null
        ? String(offer._influencerDiscountPercent)
        : '',
    });

  return (
    <div className={`inline-flex flex-col gap-0.5 ${text}`}>
      <span
        className={`${pad} rounded-md font-bold border border-emerald-500/35 bg-emerald-500/15 text-emerald-200`}
      >
        {label}
        {' · '}
        <span className="font-mono tabular-nums" dir="ltr">${formatPrice(salePrice)}</span>
      </span>
      <span className="text-[var(--text-muted)] line-through font-mono tabular-nums" dir="ltr">
        {t.partnerPublicPrice || 'Public'} ${formatPrice(publicPrice)}
      </span>
    </div>
  );
}
