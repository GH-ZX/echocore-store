/** Customer-facing store brand. */
export const STORE_BRAND = 'EchoCore';

/** Supplier integration — admin dashboard only. */
export const SUPPLIER_BRAND = 'G2Bulk';

const SUPPLIER_NAME_PATTERN = /\bG2\s*Bulk\b/gi;

/** Strip/replace supplier name in any text shown to customers. */
export function brandUserText(value) {
  if (value == null || value === '') return value;
  return String(value).replace(SUPPLIER_NAME_PATTERN, STORE_BRAND);
}