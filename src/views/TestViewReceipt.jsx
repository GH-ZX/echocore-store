import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Eye } from 'lucide-react';
import InvoiceDocument from '../components/invoices/InvoiceDocument';
import InvoiceDownloadActions from '../components/invoices/InvoiceDownloadActions';
import {
  getInvoicePreviewSample,
  INVOICE_PREVIEW_OPTIONS,
} from '../lib/invoicePreviewMocks';

/**
 * Dev-only invoice UI preview — mock data, no Supabase, no auth.
 * Open: http://localhost:5173/dev/receipt-preview
 */
export default function TestViewReceipt({
  t = {},
  lang: initialLang = 'ar',
  navigate,
  storeName = 'ECHOCORE Store',
}) {
  const invoiceRef = useRef(null);
  const [lang, setLang] = useState(initialLang);
  const [sampleId, setSampleId] = useState('redeem');
  const [downloading, setDownloading] = useState(null);

  const invoice = useMemo(
    () => getInvoicePreviewSample(sampleId, lang),
    [sampleId, lang],
  );

  const sampleLabel = (option) => (lang === 'ar' ? option.labelAr : option.labelEn);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 animate-fade-in">
      <div className="card p-4 sm:p-5 mb-5 border border-amber-500/30 bg-amber-500/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black">
                {lang === 'ar' ? 'معاينة شكل الفاتورة (تجريبي)' : 'Invoice preview (dev only)'}
              </h1>
              <p className="text-sm text-[var(--text-sec)] mt-1">
                {lang === 'ar'
                  ? 'بيانات وهمية فقط — لا تؤثر على الطلبات أو الشحن الحقيقي.'
                  : 'Mock data only — does not touch real orders or recharges.'}
              </p>
            </div>
          </div>
          {navigate && (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.backToHome || (lang === 'ar' ? 'الرئيسية' : 'Home')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {INVOICE_PREVIEW_OPTIONS.map((option) => {
            const active = sampleId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSampleId(option.id)}
                className={`inbox-filter-chip ${active ? 'inbox-filter-chip--active' : ''}`}
              >
                {sampleLabel(option)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLang('ar')}
              className={`inbox-filter-chip ${lang === 'ar' ? 'inbox-filter-chip--active' : ''}`}
            >
              العربية
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`inbox-filter-chip ${lang === 'en' ? 'inbox-filter-chip--active' : ''}`}
            >
              English
            </button>
          </div>

          <InvoiceDownloadActions
            targetRef={invoiceRef}
            filenameBase={invoice?.invoiceNumber || 'invoice-preview'}
            t={t}
            downloading={downloading}
            onDownloadingChange={setDownloading}
          />
        </div>
      </div>

      <div ref={invoiceRef}>
        <InvoiceDocument
          invoice={invoice}
          t={t}
          lang={lang}
          storeName={storeName}
        />
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center mt-4 flex items-center justify-center gap-1">
        <Download className="w-3.5 h-3.5" />
        {t.invoiceDownloadHint}
      </p>
    </div>
  );
}