/** PostgREST defaults to max 1000 rows per request — paginate to load full catalogs. */
const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllSupabaseRows(buildQuery, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}