/**
 * Keyset paging.
 *
 * OFFSET makes the database count past every row before the page it wants, so
 * page 3 of a 1,000-row page size reads 3,000 rows to return 1,000 — and it
 * gets worse the deeper the paging goes. A cursor lets it seek straight to the
 * row after the last one, which is a single index lookup at any depth. The two
 * queries that use this were 11% of every row this account read.
 */

/**
 * Where the previous page stopped.
 *
 * `sort` is the leading ORDER BY column's value and `id` breaks its ties. Both
 * are needed: two deals can expire in the same second, and paging on the sort
 * column alone would either skip them or repeat them.
 */
export interface PageCursor {
  id: string
  sort: string
}

/** One page of rows, and where to carry on from. */
export interface Page<T> {
  cursor?: PageCursor
  rows: T[]
}
