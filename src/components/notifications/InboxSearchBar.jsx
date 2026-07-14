import { Search } from 'lucide-react';

export default function InboxSearchBar({
  value = '',
  onChange,
  t = {},
  id = 'inbox-search',
}) {
  return (
    <label className="inbox-search" htmlFor={id}>
      <Search className="inbox-search__icon" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={t.inboxSearchPlaceholder}
        className="inbox-search__input"
        autoComplete="off"
      />
    </label>
  );
}