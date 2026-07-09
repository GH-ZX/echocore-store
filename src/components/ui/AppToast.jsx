import { AlertCircle, CheckCircle } from 'lucide-react';

export default function AppToast({ message, type = 'success' }) {
  const isError = type === 'error';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-4 left-4 sm:left-auto sm:right-6 sm:w-80 toast toast-enter text-[var(--text-primary)] px-5 py-3.5 rounded-xl flex items-center gap-3 z-50 ${isError ? 'toast-error' : ''}`}
    >
      {isError ? (
        <AlertCircle className="text-[var(--error)] w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
      ) : (
        <CheckCircle className="text-[var(--accent)] w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
      )}
      <span className="font-semibold text-sm leading-snug">{message}</span>
    </div>
  );
}