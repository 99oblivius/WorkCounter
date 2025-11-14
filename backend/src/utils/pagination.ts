/**
 * Pagination Utilities
 * Helpers for implementing consistent cursor-based pagination for infinite scrolling
 */

export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  cursor: number | null;
  total?: number;
}

export interface CursorPaginationOptions {
  limit: number;
  cursor?: number;
}

/**
 * Create a paginated response object
 * @param data Array of items
 * @param limit Max items per page
 * @param total Optional total count
 * @returns Paginated response with metadata (flattened structure)
 */
export function createPaginatedResponse<T extends { id: number }>(
  data: T[],
  limit: number,
  total?: number
): PaginatedResponse<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

  return {
    data: items,
    hasMore,
    cursor: nextCursor,
    ...(total !== undefined && { total })
  };
}

/**
 * Build SQL WHERE clause for cursor-based pagination
 * @param cursor Last item ID from previous page
 * @param paramCount Current parameter count for SQL
 * @param orderDirection 'ASC' or 'DESC'
 * @returns SQL clause and updated param count
 */
export function buildCursorWhereClause(
  cursor: number | undefined,
  paramCount: number,
  orderDirection: 'ASC' | 'DESC' = 'DESC'
): { clause: string; paramCount: number } {
  if (!cursor) {
    return { clause: '', paramCount };
  }

  const operator = orderDirection === 'DESC' ? '<' : '>';
  return {
    clause: `id ${operator} $${paramCount}`,
    paramCount: paramCount + 1
  };
}
