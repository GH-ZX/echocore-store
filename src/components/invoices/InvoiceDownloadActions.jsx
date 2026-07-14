import { FileImage, FileText, Loader2 } from 'lucide-react';
import { downloadInvoicePdf, downloadInvoicePng } from '../../lib/invoiceDownload';

export default function InvoiceDownloadActions({
  targetRef,
  filenameBase = 'invoice',
  t = {},
  downloading,
  onDownloadingChange,
  className = '',
}) {
  const handleDownload = async (format) => {
    if (!targetRef?.current) return;
    onDownloadingChange?.(format);
    try {
      const base = filenameBase || 'invoice';
      if (format === 'png') {
        await downloadInvoicePng(targetRef.current, `${base}.png`);
      } else {
        await downloadInvoicePdf(targetRef.current, `${base}.pdf`);
      }
    } catch (err) {
      console.error('Invoice download error:', err);
    } finally {
      onDownloadingChange?.(null);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => handleDownload('png')}
        disabled={!!downloading}
        className="btn btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2"
      >
        {downloading === 'png' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileImage className="w-4 h-4" />}
        {t.invoiceDownloadPng}
      </button>
      <button
        type="button"
        onClick={() => handleDownload('pdf')}
        disabled={!!downloading}
        className="btn btn-primary text-sm py-2 px-3 inline-flex items-center gap-2"
      >
        {downloading === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {t.invoiceDownloadPdf}
      </button>
    </div>
  );
}