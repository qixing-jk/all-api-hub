/**
 * Pagination utilities for API calls
 */

import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ApiPagination")

interface PaginationOptions {
  pageSize?: number
  maxPages?: number
  startPage?: number
  requireComplete?: boolean
}

interface PageData<T> {
  items: T[]
  total?: number
  hasMore?: boolean
  nextPage?: number | null
}

interface NumberedPageCompletionInput {
  requestedPage: number
  responsePage: unknown
  responsePageSize: unknown
  total: unknown
  itemCount: number
}

/** Indicates that a caller-required complete inventory hit the page cap. */
export class PaginationLimitError extends Error {
  constructor() {
    super("Pagination limit reached before the inventory completed")
    this.name = "PaginationLimitError"
  }
}

/**
 * Infer whether a one-based numbered page has a successor when the provider
 * returns coherent page metadata. Invalid or stale metadata is advisory only;
 * callers can fall back to their provider-specific completion signal.
 */
export function inferHasMoreFromNumberedPage({
  requestedPage,
  responsePage,
  responsePageSize,
  total,
  itemCount,
}: NumberedPageCompletionInput): boolean | undefined {
  if (
    typeof responsePage !== "number" ||
    !Number.isSafeInteger(responsePage) ||
    responsePage < 1 ||
    responsePage !== requestedPage ||
    typeof responsePageSize !== "number" ||
    !Number.isSafeInteger(responsePageSize) ||
    responsePageSize <= 0 ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isSafeInteger(itemCount) ||
    itemCount < 0
  ) {
    return undefined
  }

  const pageStart = (responsePage - 1) * responsePageSize
  const loadedThrough = pageStart + itemCount
  if (
    !Number.isSafeInteger(pageStart) ||
    !Number.isSafeInteger(loadedThrough) ||
    total < loadedThrough
  ) {
    return undefined
  }

  return loadedThrough < total
}

type ArrayOrItemsPayload<T> = T[] | { items?: T[] | null } | null | undefined

/**
 * Normalize list responses that may be either a bare array or an object with
 * an `items` array.
 */
export function extractItemsFromArrayOrItemsPayload<T>(
  payload: ArrayOrItemsPayload<T>,
): T[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === "object" && Array.isArray(payload.items)) {
    return payload.items
  }

  return []
}

/**
 * Generic paginated data fetcher with aggregation support
 * @param fetchPage - Function to fetch a single page of data
 * @param aggregator - Function to aggregate data from each page
 * @param initialValue - Initial value for aggregation
 * @param options - Pagination options
 * @returns Aggregated result
 */
async function fetchAllPaginated<T, R>(
  fetchPage: (page: number) => Promise<PageData<T>>,
  aggregator: (accumulator: R, items: T[]) => R,
  initialValue: R,
  options: PaginationOptions = {},
): Promise<R> {
  const {
    pageSize = REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
    maxPages = REQUEST_CONFIG.MAX_PAGES,
    startPage = 1,
    requireComplete = false,
  } = options

  let aggregatedData = initialValue
  let currentPage = startPage
  let pageCount = 0

  while (pageCount < maxPages) {
    const pageData = await fetchPage(currentPage)
    const items = pageData.items || []

    aggregatedData = aggregator(aggregatedData, items)

    if (pageData.nextPage === null) {
      break
    }

    if (typeof pageData.nextPage === "number") {
      currentPage = pageData.nextPage
    } else {
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
    }
    pageCount++

    if (pageCount >= maxPages) {
      logger.warn("达到最大分页限制，数据可能不完整", { maxPages })
      if (requireComplete) {
        throw new PaginationLimitError()
      }
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
