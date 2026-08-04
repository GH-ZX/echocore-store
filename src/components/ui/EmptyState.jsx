import React from 'react';

/**
 * Shared centered status/empty card (`card p-8 text-center`).
 * `icon` accepts a lucide component; `iconClass` overrides the default muted color.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconClass = 'text-[var(--text-muted)]',
  className = '',
  children,
}) {
  return (
    <div className={`card p-8 text-center ${className}`}>
      {Icon && <Icon className={`w-12 h-12 mx-auto ${iconClass} mb-4`} strokeWidth={1.5} />}
      {title && <h2 className="text-xl font-black text-[var(--text-primary)]">{title}</h2>}
      {description && (
        <p className="text-sm text-[var(--text-sec)] leading-relaxed max-w-md mx-auto mt-2">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
      {children}
    </div>
  );
}
