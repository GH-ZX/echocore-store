import EchoLogo from '../ui/EchoLogo';
import { INVOICE_KIND } from '../../lib/invoiceBuilder';
import { formatInvoiceDate } from '../../lib/invoiceFormat';
import { formatMessage } from '../../lib/i18n';

function paymentMethodLabel(method, t) {
  if (method === 'balance') return t.payFromBalance;
  if (method === 'admin_gift') return t.orderPaymentGift;
  if (method === 'ShamCash') return t.shamCash;
  if (method === 'SyriatelCash') return t.syriatelCash;
  return method || '—';
}

function MetaItem({ label, value, mono = false, accent = false }) {
  if (!value) return null;
  return (
    <div className="invoice-meta-item">
      <span className="invoice-meta-item-label">{label}</span>
      <span className={`invoice-meta-item-value ${mono ? 'font-mono' : ''} ${accent ? 'invoice-meta-item-value--accent' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function LineDeliveryDetails({ line, t }) {
  const hasPlayer = line.playerUid || line.playerServer || line.playerCharname || line.redemptionExtras?.length > 0;
  const hasCodes = line.hasCodes && line.codes?.length > 0;
  const hasSteps = Array.isArray(line.redeemSteps) && line.redeemSteps.length > 0;

  if (!hasPlayer && !hasCodes && !hasSteps) return null;

  return (
    <div className="invoice-item-details">
      {hasCodes && (
        <div className="invoice-detail-group">
          <div className="invoice-detail-title">{t.invoiceRedeemCodesLabel}</div>
          {line.codes.map((code) => (
            <div key={code} className="invoice-code-value">{code}</div>
          ))}
        </div>
      )}

      {hasPlayer && (
        <div className="invoice-detail-group">
          <div className="invoice-detail-title">{t.invoiceDeliveryDetailsLabel}</div>
          <div className="invoice-detail-grid">
            {line.playerUid && (
              <div><span>{t.playerUidLabel}</span><strong className="font-mono">{line.playerUid}</strong></div>
            )}
            {line.playerServer && (
              <div><span>{t.serverLabel}</span><strong className="font-mono">{line.playerServer}</strong></div>
            )}
            {line.playerCharname && (
              <div><span>{t.charnameLabel}</span><strong>{line.playerCharname}</strong></div>
            )}
            {line.redemptionExtras?.map((entry) => (
              <div key={`${entry.key}-${entry.value}`}>
                <span>{entry.key}</span>
                <strong className="font-mono">{entry.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSteps && (
        <div className="invoice-detail-group">
          <div className="invoice-detail-title">{t.invoiceHowToRedeemLabel}</div>
          <ol className="invoice-detail-steps">
            {line.redeemSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function InvoiceDocument({
  invoice,
  t = {},
  lang = 'ar',
  storeName = 'ECHOCORE Store',
}) {
  if (!invoice) return null;

  const isRecharge = invoice.kind === INVOICE_KIND.RECHARGE;
  const title = isRecharge ? t.invoiceTitleRecharge : t.invoiceTitleOrder;
  const productLines = (invoice.lines || []).filter((line) => line.deliveryType !== 'recharge');
  const showCustomer = !!(invoice.customerName || invoice.customerUsername || invoice.customerEmail);
  const totalLabel = isRecharge ? t.invoiceRechargeTotalLabel : t.total;
  const totalValue = isRecharge ? invoice.amount : invoice.total;

  return (
    <div className="invoice-sheet" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="invoice-header">
        <div className="invoice-header-brand">
          <EchoLogo className="invoice-brand-logo" alt={storeName} />
          <div>
            <div className="invoice-store-name">{storeName}</div>
            <div className="invoice-store-tag">{title}</div>
          </div>
        </div>

        <div className="invoice-header-id">
          <div className="invoice-type-badge">{title}</div>
          <MetaItem label={t.invoiceNumberLabel} value={invoice.invoiceNumber} mono />
          <MetaItem label={t.date} value={formatInvoiceDate(invoice.issuedAt)} mono />
        </div>
      </header>

      <div className="invoice-divider" />

      <div className="invoice-body-grid">
        {showCustomer && (
          <section className="invoice-section">
            <h3 className="invoice-section-title">{t.invoiceCustomerSection}</h3>
            <div className="invoice-section-content">
              {invoice.customerName && (
                <p><span>{t.invoiceCustomerNameLabel}:</span> {invoice.customerName}</p>
              )}
              {invoice.customerUsername && (
                <p><span>{t.profileUsername}:</span> <strong className="font-mono">{invoice.customerUsername}</strong></p>
              )}
              {invoice.customerEmail && (
                <p><span>{t.email}:</span> {invoice.customerEmail}</p>
              )}
            </div>
          </section>
        )}

        <section className="invoice-section">
          <h3 className="invoice-section-title">{t.orderPaymentMethodLabel}</h3>
          <div className="invoice-section-content">
            <p><span>{t.orderPaymentMethodLabel}:</span> {paymentMethodLabel(invoice.paymentMethod, t)}</p>
          </div>
        </section>
      </div>

      {invoice.giftMessage && (
        <div className="invoice-note invoice-note--gift">
          <strong>{t.giftMessageLabel}:</strong> {invoice.giftMessage}
        </div>
      )}

      {/* Gift / redeem codes — always prominent when present */}
      {!isRecharge && invoice.hasCodes && Array.isArray(invoice.allCodes) && invoice.allCodes.length > 0 && (
        <section className="invoice-section invoice-codes-hero">
          <h3 className="invoice-section-title">{t.invoiceRedeemCodesLabel}</h3>
          <div className="invoice-section-content space-y-2">
            {invoice.allCodes.map((code) => (
              <div key={code} className="invoice-code-value invoice-code-value--hero font-mono">
                {code}
              </div>
            ))}
          </div>
        </section>
      )}

      {!isRecharge && productLines.length > 0 && (
        <>
          <table className="invoice-table">
            <thead>
              <tr>
                <th>{t.itemsPurchased}</th>
                <th>{t.invoiceTableQty}</th>
                <th>{t.invoiceTablePrice}</th>
                <th>{t.invoiceTableLineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {productLines.map((line) => (
                <tr key={line.id || line.name}>
                  <td>
                    <div className="invoice-table-item">{line.name}</div>
                    {line.gameName && <div className="invoice-table-sub">{line.gameName}</div>}
                    {line.hasCodes && line.codes?.length > 0 && (
                      <div className="invoice-table-sub font-mono mt-1">
                        {t.invoiceRedeemCodesLabel}: {line.codes.join(' · ')}
                      </div>
                    )}
                  </td>
                  <td>{line.quantity || 1}</td>
                  <td className="font-mono">{line.price}</td>
                  <td className="font-mono invoice-accent">{line.lineTotal || line.price}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {productLines.map((line) => (
            <LineDeliveryDetails key={`details-${line.id || line.name}`} line={line} t={t} />
          ))}
        </>
      )}

      <div className="invoice-summary">
        <div className="invoice-summary-row">
          <span>{totalLabel}</span>
          <span className="invoice-summary-total">{totalValue}</span>
        </div>
      </div>

      {invoice.notes && (
        <p className="invoice-note">{invoice.notes}</p>
      )}

      <footer className="invoice-footer">
        {formatMessage(t.invoiceFooterNote, { store: storeName })}
      </footer>
    </div>
  );
}