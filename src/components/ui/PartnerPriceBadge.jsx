import { formatPrice } from '../../lib/offerDisplay';

/**
 * Shows public vs partner price when offer was remapped (_partnerPriced).
 */
export default function PartnerPriceBadge({ offer, t = {}, size = 'sm' }) {
  if (!offer?._partnerPriced) return null;
  const publicPrice = Number(offer._publicPrice);
  const partnerPrice = Number(offer.price);
  if (!Number.isFinite(publicPrice) || !Number.isFinite(partnerPrice)) return null;
  if (publicPrice <= partnerPrice) return null;

  const text = size === 'lg' ? 'text-xs' : 'text-[10px]';
  const pad = size === 'lg' ? 'px-2 py-1' : 'px-1.5 py-0.5';

  return (
    <div className={`inline-flex flex-col gap-0.5 ${text}`}>
      <span
        className={`${pad} rounded-md font-bold border border-emerald-500/35 bg-emerald-500/15 text-emerald-200`}
      >
        {t.partnerPriceBadge || 'Partner'}
        {' · '}
        <span className="font-mono tabular-nums" dir="ltr">${formatPrice(partnerPrice)}</span>
      </span>
      <span className="text-[var(--text-muted)] line-through font-mono tabular-nums" dir="ltr">
        {t.partnerPublicPrice || 'Public'} ${formatPrice(publicPrice)}
      </span>
    </div>
  );
}
