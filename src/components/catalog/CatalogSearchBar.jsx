import { Search } from 'lucide-react';

export default function CatalogSearchBar({
  value,
  onChange,
  placeholder,
  className = '',
}) {
  return (
    <div className={`input flex items-center gap-3 mb-6 !py-0 !px-3 rounded-2xl ${className}`}>
      <Search className="w-4 h-4 shrink-0 text-[var(--text-muted)] pointer-events-none" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent border-0 outline-none shadow-none py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        autoComplete="off"
      />
    </div>
  );
}