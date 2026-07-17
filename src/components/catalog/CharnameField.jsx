import { UserCircle } from 'lucide-react';
import { gameShowsCharnameField, getEffectiveTopupNotes } from '../../lib/gameTopupFields';

export default function CharnameField({
  game,
  topupMeta = null,
  value = '',
  onChange,
  t = {},
  required = false,
  inputClassName = '',
}) {
  if (!gameShowsCharnameField(game, topupMeta)) return null;

  const notes = getEffectiveTopupNotes(game, topupMeta);

  return (
    <div>
      <label className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1 mb-1">
        <UserCircle className="w-3.5 h-3.5" />
        {t.charnameLabel}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={t.charnamePlaceholder}
        className={inputClassName}
      />
      {notes && (
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{notes}</p>
      )}
      {required && !String(value ?? '').trim() && (
        <div className="text-xs text-amber-400 mt-1">{t.charnameRequired}</div>
      )}
    </div>
  );
}