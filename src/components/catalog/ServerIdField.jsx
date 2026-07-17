import { Server } from 'lucide-react';
import {
  gameShowsServerField,
  gameUsesServerDropdown,
  getDefaultGameServerId,
  getGameServerOptions,
  getServerFieldPlaceholder,
} from '../../lib/gameServers';
import { getEffectiveTopupNotes } from '../../lib/gameTopupFields';

export default function ServerIdField({
  game,
  topupMeta = null,
  value = '',
  onChange,
  t = {},
  required = false,
  showHint = true,
  inputClassName = '',
  selectClassName = '',
}) {
  if (!gameShowsServerField(game, topupMeta)) return null;

  const options = getGameServerOptions(game, topupMeta);
  const useDropdown = gameUsesServerDropdown(game, topupMeta);
  const defaultServerId = getDefaultGameServerId(game, topupMeta);
  const effectiveValue = String(value ?? '').trim() || defaultServerId;
  const placeholder = getServerFieldPlaceholder(game, t, topupMeta);
  const fieldClassName = inputClassName || selectClassName || 'input w-full';
  const notes = getEffectiveTopupNotes(game, topupMeta);

  return (
    <div>
      <label className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1 mb-1">
        <Server className="w-3.5 h-3.5" />
        {useDropdown ? t.serverSelectLabel : t.serverLabel}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {useDropdown ? (
        <select
          value={value || defaultServerId || ''}
          onChange={(e) => onChange?.(e.target.value)}
          className={selectClassName || inputClassName || 'input w-full'}
        >
          <option value="">{t.serverSelectPlaceholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className={fieldClassName}
        />
      )}

      {showHint && !useDropdown && (
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.serverDefaultHint}</p>
      )}
      {showHint && useDropdown && notes && (
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{notes}</p>
      )}
      {required && !effectiveValue && (
        <div className="text-xs text-amber-400 mt-1">{t.serverRequired}</div>
      )}
    </div>
  );
}