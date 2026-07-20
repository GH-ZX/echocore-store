import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Consistent “go to page” control for admin overview section headers.
 * In Arabic (RTL) the chevron points left; in LTR it points right.
 */
export default function AdminDashGoTo({
  label,
  onClick,
  lang = 'ar',
  className = '',
  disabled = false,
}) {
  if (!label || typeof onClick !== 'function') return null;
  const Icon = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`admin-dash-goto ${className}`.trim()}
    >
      <span className="admin-dash-goto__label">{label}</span>
      <Icon className="admin-dash-goto__icon" strokeWidth={2.5} aria-hidden />
    </button>
  );
}
