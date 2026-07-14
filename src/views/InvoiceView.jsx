import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import InvoiceDocument from '../components/invoices/InvoiceDocument';
import InvoiceDownloadActions from '../components/invoices/InvoiceDownloadActions';
import {
  canViewOrderInvoice,
  canViewRechargeInvoice,
  fetchOrderInvoiceData,
  fetchRechargeInvoiceData,
  isInvoiceReadyForOrder,
  isInvoiceReadyForRecharge,
} from '../lib/invoices';
import { INVOICE_KIND } from '../lib/invoiceBuilder';
import { supabase } from '../lib/supabase';

export default function InvoiceView({
  navigate,
  t = {},
  lang = 'ar',
  user,
  games = [],
  offers = [],
  storeName = 'ECHOCORE Store',
}) {
  const { kind, id } = useParams();
  const invoiceRef = useRef(null);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const loadInvoice = useCallback(async () => {
    if (!id || !user) return;

    setLoading(true);
    setErrorKey(null);

    try {
      if (kind === INVOICE_KIND.ORDER) {
        const { data: order } = await supabase
          .from('orders')
          .select('id, user_id, status, fulfillment_status, payment_method')
          .eq('id', id)
          .maybeSingle();

        if (!order) {
          setErrorKey('invoiceNotFound');
          setInvoice(null);
          return;
        }
        if (!canViewOrderInvoice(order, user)) {
          setErrorKey('invoiceAccessDenied');
          setInvoice(null);
          return;
        }
        if (!isInvoiceReadyForOrder(order, { isAdmin: user?.role === 'admin' })) {
          setErrorKey('invoiceNotReady');
          setInvoice(null);
          return;
        }

        const built = await fetchOrderInvoiceData(id, { games, offers, t, lang, viewer: user });
        setInvoice(built);
        return;
      }

      if (kind === INVOICE_KIND.RECHARGE) {
        const { data: recharge } = await supabase
          .from('recharge_requests')
          .select('id, user_id, status')
          .eq('id', id)
          .maybeSingle();

        if (!recharge) {
          setErrorKey('invoiceNotFound');
          setInvoice(null);
          return;
        }
        if (!canViewRechargeInvoice(recharge, user)) {
          setErrorKey('invoiceAccessDenied');
          setInvoice(null);
          return;
        }
        if (!isInvoiceReadyForRecharge(recharge, { isAdmin: user?.role === 'admin' })) {
          setErrorKey('invoiceNotReady');
          setInvoice(null);
          return;
        }

        const built = await fetchRechargeInvoiceData(id, { t, lang, viewer: user });
        setInvoice(built);
        return;
      }

      setErrorKey('invoiceNotFound');
      setInvoice(null);
    } catch (err) {
      console.error('Invoice load error:', err);
      setErrorKey('invoiceLoadFailed');
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [games, id, kind, lang, offers, t, user]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mx-auto mb-3" />
        <p className="text-[var(--text-sec)]">{t.loadingInvoice}</p>
      </div>
    );
  }

  if (errorKey || !invoice) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <p className="text-xl text-[var(--text-sec)] mb-4">{t[errorKey] || t.invoiceNotFound}</p>
        <button type="button" onClick={() => navigate('/notifications')} className="btn btn-secondary">
          {t.siteInboxTitle}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-[var(--text-sec)] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.back}
        </button>

        <InvoiceDownloadActions
          targetRef={invoiceRef}
          filenameBase={invoice?.invoiceNumber || 'invoice'}
          t={t}
          downloading={downloading}
          onDownloadingChange={setDownloading}
        />
      </div>

      <div ref={invoiceRef}>
        <InvoiceDocument invoice={invoice} t={t} lang={lang} storeName={storeName} />
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center mt-4 flex items-center justify-center gap-1">
        <Download className="w-3.5 h-3.5" />
        {t.invoiceDownloadHint}
      </p>
    </div>
  );
}