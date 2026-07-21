import { AlertCircle, CheckCircle } from 'lucide-react';

/**
 * Site toast. Optional onClick makes the whole chip open a destination (e.g. receipt).
 */
export default function AppToast({
  message,
  type = 'success',
  title = null,
  body = null,
  hint = null,
  onClick = null,
}) {
  const isError = type === 'error';
  const clickable = typeof onClick === 'function';
  const textBody = body || (!title ? message : null);
  const className = [
    'fixed bottom-6 right-4 left-4 sm:left-auto sm:right-6 sm:w-80',
    'toast toast-enter text-[var(--text-primary)] px-5 py-3.5 rounded-xl',
    'flex items-start gap-3 z-50 text-start',
    isError ? 'toast-error' : '',
    clickable ? 'cursor-pointer hover:brightness-110 active:scale-[0.99] transition' : '',
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {isError ? (
        <AlertCircle className="text-[var(--error)] w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
      ) : (
        <CheckCircle className="text-[var(--accent)] w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
      )}
      <div className="min-w-0 flex-1">
        {title ? (
          <div className="font-bold text-sm leading-snug">{title}</div>
        ) : null}
        {textBody ? (
          <div className={`leading-snug ${title ? 'text-xs text-[var(--text-sec)] mt-0.5' : 'font-semibold text-sm'}`}>
            {textBody}
          </div>
        ) : null}
        {clickable && hint ? (
          <div className="text-[10px] uppercase tracking-wide text-[var(--accent)] font-bold mt-1.5 opacity-90">
            {hint}
          </div>
        ) : null}
      </div>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        role="status"
        aria-live="polite"
        className={className}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div role="status" aria-live="polite" className={className}>
      {content}
    </div>
  );
}