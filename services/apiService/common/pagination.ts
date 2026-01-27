/**
 * Pagination utilities for API calls
 */

import { createLogger } from "~/utils/logger"

import { REQUEST_CONFIG } from "./constant"

const logger = createLogger("ApiPagination")

export interface PaginationOptions {
  pageSize?: number
  maxPages?: number
  startPage?: number
}

export interface PaginatedResult<T> {
  data: T[]
  totalPages: number
  currentPage: number
  hasMore: boolean
}

export interface PageData<T> {
  items: T[]
  total?: number
  hasMore?: boolean
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
  fetchPage: (page: number) => Promise<PageData<T>>,
  aggregator: (accumulator: R, items: T[]) => R,
  initialValue: R,
  options: PaginationOptions = {},
): Promise<R> {
  const {
    pageSize = REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
    maxPages = REQUEST_CONFIG.MAX_PAGES,
    startPage = 1,
  } = options

  let aggregatedData = initialValue
  let currentPage = startPage
  let pageCount = 0

  while (pageCount < maxPages) {
    const pageData = await fetchPage(currentPage)
    const items = pageData.items || []

    aggregatedData = aggregator(aggregatedData, items)

    if (typeof pageData.hasMore === "boolean") {
      if (!pageData.hasMore) {
        break
      }
    } else if (typeof pageData.total === "number") {
      const totalPages = Math.ceil((pageData.total || 0) / pageSize)
      const pageIndex = currentPage - startPage + 1
      if (pageIndex >= totalPages) {
        break
      }
    } else if (items.length < pageSize) {
      break
    }

    currentPage++
    pageCount++

    if (pageCount >= maxPages) {
      logger.warn("达到最大分页限制，数据可能不完整", { maxPages })
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
  fetchPage: (page: number) => Promise<PageData<T>>,
  options: PaginationOptions = {},
): Promise<T[]> {
  return fetchAllPaginated(
    fetchPage,
    (accumulator: T[], items: T[]) => [...accumulator, ...items],
    [],
    options,
  )
}
