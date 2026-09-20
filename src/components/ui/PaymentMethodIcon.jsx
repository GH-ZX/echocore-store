/**
 * Renders lucide icon or brand logo (e.g. ShamCash SVG, Binance Pay SVG) for payment method pickers.
 */
export default function PaymentMethodIcon({ method, className = 'w-7 h-7' }) {
  const handleImgError = (e) => {
    e.currentTarget.style.display = 'none';
  };

  if (method?.logos && Array.isArray(method.logos) && method.logos.length > 0) {
    return (
      <div className="flex items-center gap-1.5 h-full">
        {method.logos.map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt=""
            className={`payment-method-logo object-contain ${className}`.trim()}
            width={28}
            height={28}
            decoding="async"
            draggable={false}
            onError={handleImgError}
          />
        ))}
      </div>
    );
  }

  if (method?.isMultiLogo) {
    return (
      <div className="flex items-center gap-1.5 h-full">
        <img
          src="/shamcash-logo.svg"
          alt="ShamCash"
          className={`payment-method-logo object-contain ${className}`.trim()}
          width={28}
          height={28}
          decoding="async"
          draggable={false}
          onError={handleImgError}
        />
        <img
          src="/binance-pay-logo.svg"
          alt="Binance Pay"
          className={`payment-method-logo object-contain ${className}`.trim()}
          width={28}
          height={28}
          decoding="async"
          draggable={false}
          onError={handleImgError}
        />
      </div>
    );
  }

  if (method?.logoSrc) {
    return (
      <img
        src={method.logoSrc}
        alt=""
        className={`payment-method-logo object-contain ${className}`.trim()}
        width={28}
        height={28}
        decoding="async"
        draggable={false}
        onError={handleImgError}
      />
    );
  }

  const Icon = method?.icon;
  if (!Icon) return null;
  return <Icon className={className} aria-hidden />;
}
