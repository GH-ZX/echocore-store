import React from 'react';

const TONES = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  red: 'border-red-500/30 bg-red-500/10 text-red-200',
  green: 'border-green-500/30 bg-green-500/10 text-green-300',
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
};

/**
 * Shared inline alert banner (`border-X-500/30 bg-X-500/10` + tone text).
 * Pass `centered` for the large centered variant (py-6 rounded-2xl text-center).
 */
export default function AlertBanner({
  tone = 'amber',
  centered = false,
  className = '',
  children,
}) {
  const toneClass = TONES[tone] || TONES.amber;
  return (
    <div
      className={`rounded-xl border ${toneClass} ${
        centered ? 'py-6 text-center rounded-2xl' : 'px-4 py-3 text-sm'
      } ${className}`}
    >
      {children}
    </div>
  );
}
