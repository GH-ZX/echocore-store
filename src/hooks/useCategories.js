import { useEffect, useState } from 'react';
import { fetchCategories } from '../lib/manualProducts';

// Active storefront categories, fetched once per page load and shared by every caller.
let cache = null;
let pending = null;

function loadCategories() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetchCategories()
      .then((rows) => {
        cache = rows;
        return rows;
      })
      .catch(() => [])
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function useCategories() {
  const [categories, setCategories] = useState(() => cache || []);
  useEffect(() => {
    let cancelled = false;
    loadCategories().then((rows) => {
      if (!cancelled) setCategories(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return categories;
}

export function categoryLabel(category, lang) {
  return (lang === 'ar' ? category?.name_ar : category?.name_en) || category?.name_ar || category?.name_en || '';
}
