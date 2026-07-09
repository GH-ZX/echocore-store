export default function ConfirmDialog({
  open = false,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500 text-white border-red-600'
      : 'btn btn-primary';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={loading ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl p-5"
      >
        {title && (
          <h3 id="confirm-dialog-title" className="text-lg font-bold mb-2">
            {title}
          </h3>
        )}
        <p id="confirm-dialog-message" className="text-sm text-[var(--text-sec)] leading-relaxed">
          {message}
        </p>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`btn flex-1 py-2.5 disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? '...' : confirmLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="btn btn-secondary flex-1 py-2.5 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}