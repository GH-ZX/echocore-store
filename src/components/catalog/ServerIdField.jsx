import { Server } from 'lucide-react';
import {
  gameShowsServerField,
  getDefaultGameServerId,
  getServerFieldPlaceholder,
} from '../../lib/gameServers';

export default function ServerIdField({
  game,
  value = '',
  onChange,
  t = {},
  required = false,
  showHint = true,
  inputClassName = '',
}) {
  if (!gameShowsServerField(game)) return null;

  const defaultServerId = getDefaultGameServerId(game);
  const effectiveValue = String(value ?? '').trim() || defaultServerId;
  const placeholder = getServerFieldPlaceholder(game, t);

  return (
    <div>
      <label className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1 mb-1">
        <Server className="w-3.5 h-3.5" />
        {t.serverLabel}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {showHint && (
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.serverDefaultHint}</p>
      )}
      {required && !effectiveValue && (
        <div className="text-xs text-amber-400 mt-1">{t.serverRequired}</div>
      )}
    </div>
  );
}