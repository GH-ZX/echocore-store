/**
 * Renders lucide icon or brand logo (e.g. ShamCash SVG) for payment method pickers.
 */
export default function PaymentMethodIcon({ method, className = 'w-7 h-7' }) {
  if (method?.isMultiLogo) {
    return (
      <div className="flex items-center gap-1.5 h-full">
        <img src="/shamcash-logo.svg" alt="" className={`payment-method-logo ${className}`.trim()} width={28} height={32} decoding="async" draggable={false} />
        <img src="/binance-pay-logo.svg" alt="" className={`payment-method-logo ${className}`.trim()} width={28} height={32} decoding="async" draggable={false} />
      </div>
    );
  }
  if (method?.logoSrc) {
    return (
      <img
        src={method.logoSrc}
        alt=""
        className={`payment-method-logo ${className}`.trim()}
        width={28}
        height={32}
        decoding="async"
        draggable={false}
      />
    );
  }

  const Icon = method?.icon;
  if (!Icon) return null;
  return <Icon className={className} aria-hidden />;
}
