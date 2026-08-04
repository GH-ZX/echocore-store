import React from 'react';

/**
 * Shared page/section header: accent icon tile + title (+ optional subtitle).
 * `icon` accepts a lucide component. Extra className merges on the row.
 */
export default function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  className = '',
  iconClassName = '',
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {Icon && (
        <span
          className={`inline-flex w-10 h-10 shrink-0 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] items-center justify-center ${iconClassName}`}
        >
          <Icon className="w-5 h-5" strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-xl font-black">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--text-sec)] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
