/**
 * Pack titles (e.g. "60 UC") must stay LTR so number + currency order is correct on RTL pages.
 */
export default function OfferPackLabel({ children, className = '', as: Tag = 'span' }) {
  if (children == null || children === '') return null;

  return (
    <Tag
      dir="ltr"
      lang="en"
      className={className ? `offer-pack-label ${className}` : 'offer-pack-label'}
    >
      {children}
    </Tag>
  );
}