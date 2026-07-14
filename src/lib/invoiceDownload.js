import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

function triggerDownload(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function sanitizeFilename(value = 'invoice') {
  return String(value).replace(/[^\w.-]+/g, '_').slice(0, 80);
}

async function captureInvoicePng(element) {
  return toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
  });
}

export async function downloadInvoicePng(element, filename = 'invoice.png') {
  if (!element) throw new Error('Invoice element missing');
  const dataUrl = await captureInvoicePng(element);
  triggerDownload(dataUrl, sanitizeFilename(filename));
}

/** PDF = invoice screenshot embedded in A4 pages (matches on-screen layout). */
export async function downloadInvoicePdf(element, filename = 'invoice.pdf') {
  if (!element) throw new Error('Invoice element missing');

  const dataUrl = await captureInvoicePng(element);

  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const printableW = pageW - margin * 2;
  const printableH = pageH - margin * 2;
  const imgH = (img.height * printableW) / img.width;

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < imgH) {
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(
      dataUrl,
      'PNG',
      margin,
      margin - offsetY,
      printableW,
      imgH,
      undefined,
      'FAST',
    );
    offsetY += printableH;
    pageIndex += 1;
  }

  pdf.save(sanitizeFilename(filename));
}