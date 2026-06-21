import { Pencil } from 'lucide-react';

export default function AdminEditButton({ onClick, label, className = '', iconOnly = false }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/15 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition-all hover:bg-[var(--accent)]/25 active:scale-95 ${className}`}
      title={label}
    >
      <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
      {!iconOnly && label}
    </button>
  );
}