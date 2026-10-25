// Fetch every page from a Supabase/PostgREST query builder.
// createQuery must return a fresh query builder for each range.
export async function fetchAllPages(createQuery, pageSize = 1000) {
  if (typeof createQuery !== 'function') throw new TypeError('createQuery must be a function')
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive integer')

  const allRows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await createQuery().range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message || 'Could not load all records.')
    const rows = Array.isArray(data) ? data : []
    allRows.push(...rows)
    if (rows.length < pageSize) return allRows
  }
}
