import { useEffect, useState } from 'react';
import { Spinner } from '../routing/PageLoader';
import { getPaymentProofUrl } from '../../lib/paymentProof';

/**
 * Receipt image a customer uploaded for a manual payment. The bucket is private, so this asks for a
 * short-lived signed link. `compact` = small thumbnail (Overview cards); default = larger preview.
 */
export default function AdminProofReceipt({ path, t = {}, compact = false }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    getPaymentProofUrl(path).then((signed) => {
      if (cancelled) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [path]);

  if (failed) {
    return <div className="text-xs text-red-300">{t.adminRechargeReceiptMissing}</div>;
  }
  if (!url) {
    return <Spinner size="sm" className="text-[var(--accent)]" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-block"
      aria-label={t.adminRechargeReceiptOpen}
    >
      <img
        src={url}
        alt=""
        className={`${compact ? 'h-20 w-20 object-cover' : 'max-h-64 max-w-full object-contain'} rounded-xl border border-[var(--border)] bg-white`}
      />
      {!compact && (
        <span className="block mt-1 text-[11px] text-[var(--accent)] underline">{t.adminRechargeReceiptOpen}</span>
      )}
    </a>
  );
}
