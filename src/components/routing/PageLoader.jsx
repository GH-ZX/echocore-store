import { Loader2 } from 'lucide-react';

export default function PageLoader({ t }) {
  return (
    <div
      className="page-loader flex min-h-[40vh] items-center justify-center px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="page-loader-card flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm font-semibold">
        <Loader2 className="page-loader-spinner h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{t.openingPage}</span>
      </div>
    </div>
  );
}
