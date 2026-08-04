import React from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * Shared back button (`<ArrowLeft/> t.back`). Requires an `onClick` (usually
 * `navigate(-1)` or a step reset). Pass `ariaLabel` for the aria-label.
 */
export default function BackButton({
  onClick,
  t = {},
  label,
  ariaLabel,
  className = 'mb-4',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || label}
      className={`flex items-center gap-2 text-sm text-[var(--text-sec)] hover:text-white transition-colors ${className}`}
    >
      <ArrowLeft className="w-4 h-4" /> {label || t.back}
    </button>
  );
}
