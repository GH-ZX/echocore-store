import Modal from './Modal';

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
  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500 text-white border-red-600'
      : 'btn btn-primary';

  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      role="alertdialog"
      size="sm"
      ariaLabelledBy={title ? 'confirm-dialog-title' : undefined}
      ariaDescribedBy="confirm-dialog-message"
      panelClassName="p-5 shadow-2xl"
      scrollable={false}
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
    </Modal>
  );
}