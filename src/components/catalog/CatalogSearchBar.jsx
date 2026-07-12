import { Search } from 'lucide-react';

export default function CatalogSearchBar({
  value,
  onChange,
  placeholder,
  className = '',
}) {
  return (
    <div className={`relative mb-6 ${className}`}>
      <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none start-4" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input w-full ps-11 pe-4 py-3 rounded-2xl"
        autoComplete="off"
      />
    </div>
  );
}