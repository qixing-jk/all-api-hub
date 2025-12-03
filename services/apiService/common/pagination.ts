/**
 * Pagination utilities for API calls
 */

import { REQUEST_CONFIG } from "./constant"

export interface PaginationOptions {
  pageSize?: number
  maxPages?: number
}

export interface PaginatedResult<T> {
  data: T[]
  totalPages: number
  currentPage: number
  hasMore: boolean
}

/**
 * Generic paginated data fetcher with aggregation support
 * @param fetchPage - Function to fetch a single page of data
 * @param aggregator - Function to aggregate data from each page
 * @param initialValue - Initial value for aggregation
 * @param options - Pagination options
 * @returns Aggregated result
 */
export async function fetchAllPaginated<T, R>(
  fetchPage: (page: number) => Promise<{
    items: T[]
    total: number
  }>,
  aggregator: (accumulator: R, items: T[]) => R,
  initialValue: R,
  options: PaginationOptions = {},
): Promise<R> {
  const {
    pageSize = REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
    maxPages = REQUEST_CONFIG.MAX_PAGES,
  } = options

  let aggregatedData = initialValue
  let currentPage = 1

  while (currentPage <= maxPages) {
    const pageData = await fetchPage(currentPage)
    const items = pageData.items || []

    aggregatedData = aggregator(aggregatedData, items)

    const totalPages = Math.ceil((pageData.total || 0) / pageSize)

    if (currentPage >= totalPages) {
      break
    }

    currentPage++

    if (currentPage > maxPages) {
      console.warn(`达到最大分页限制(${maxPages}页)，数据可能不完整`)
    }
  }

  return aggregatedData
}

/**
 * Simple paginated data fetcher that returns all items
 * @param fetchPage - Function to fetch a single page of data
 * @param options - Pagination options
 * @returns All items from all pages
 */
export async function fetchAllItems<T>(
  fetchPage: (page: number) => Promise<{
    items: T[]
    total: number
  }>,
  options: PaginationOptions = {},
): Promise<T[]> {
  return fetchAllPaginated(
    fetchPage,
    (accumulator: T[], items: T[]) => [...accumulator, ...items],
    [],
    options,
  )
}
