import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  extractItemsFromArrayOrItemsPayload,
  fetchAllItems,
  inferHasMoreFromNumberedPage,
  PaginationLimitError,
} from "~/services/apiTransport/pagination"

const { mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    warn: mockLoggerWarn,
  })),
}))

describe("API transport pagination helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("extractItemsFromArrayOrItemsPayload normalizes arrays, item envelopes, and invalid payloads", () => {
    expect(extractItemsFromArrayOrItemsPayload([1, 2, 3])).toEqual([1, 2, 3])
    expect(extractItemsFromArrayOrItemsPayload({ items: ["a", "b"] })).toEqual([
      "a",
      "b",
    ])
    expect(extractItemsFromArrayOrItemsPayload({ items: null })).toEqual([])
    expect(extractItemsFromArrayOrItemsPayload({})).toEqual([])
    expect(extractItemsFromArrayOrItemsPayload(null)).toEqual([])
    expect(extractItemsFromArrayOrItemsPayload(undefined)).toEqual([])
  })

  it("infers numbered-page completion only from coherent one-based metadata", () => {
    expect(
      inferHasMoreFromNumberedPage({
        requestedPage: 1,
        responsePage: 1,
        responsePageSize: 2,
        total: 3,
        itemCount: 2,
      }),
    ).toBe(true)
    expect(
      inferHasMoreFromNumberedPage({
        requestedPage: 2,
        responsePage: 2,
        responsePageSize: 2,
        total: 3,
        itemCount: 1,
      }),
    ).toBe(false)
    expect(
      inferHasMoreFromNumberedPage({
        requestedPage: 2,
        responsePage: 1,
        responsePageSize: 2,
        total: 3,
        itemCount: 1,
      }),
    ).toBeUndefined()
    expect(
      inferHasMoreFromNumberedPage({
        requestedPage: 0,
        responsePage: 0,
        responsePageSize: 2,
        total: 1,
        itemCount: 1,
      }),
    ).toBeUndefined()
    expect(
      inferHasMoreFromNumberedPage({
        requestedPage: 2,
        responsePage: 2,
        responsePageSize: 2,
        total: 2,
        itemCount: 1,
      }),
    ).toBeUndefined()
  })

  it("fetchAllItems stops when the upstream explicitly says there are no more pages", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ["page-1"], hasMore: true })
      .mockResolvedValueOnce({ items: ["page-2"], hasMore: false })

    await expect(fetchAllItems(fetchPage)).resolves.toEqual([
      "page-1",
      "page-2",
    ])
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2)
  })

  it("fetchAllItems follows an explicit provider-normalized next page", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ["page-1"], nextPage: 2 })
      .mockResolvedValueOnce({ items: ["page-2"], nextPage: null })

    await expect(fetchAllItems(fetchPage, { startPage: 0 })).resolves.toEqual([
      "page-1",
      "page-2",
    ])
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2)
    expect(fetchPage).not.toHaveBeenCalledWith(1)
  })

  it("fetchAllItems stops when a short page implies the last page", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ["page-1", "page-2"] })
      .mockResolvedValueOnce({ items: ["tail"] })

    await expect(fetchAllItems(fetchPage, { pageSize: 2 })).resolves.toEqual([
      "page-1",
      "page-2",
      "tail",
    ])
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it("fetchAllItems warns when pagination reaches the configured max page cap", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: ["keep-going"] })

    await expect(
      fetchAllItems(fetchPage, {
        startPage: 2,
        pageSize: 1,
        maxPages: 1,
      }),
    ).resolves.toEqual(["keep-going"])

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(2)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "达到最大分页限制，数据可能不完整",
      {
        maxPages: 1,
      },
    )
  })

  it("fetchAllItems fails closed when a caller requires a complete inventory", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: ["keep-going"],
      hasMore: true,
    })

    await expect(
      fetchAllItems(fetchPage, {
        pageSize: 1,
        maxPages: 1,
        requireComplete: true,
      }),
    ).rejects.toBeInstanceOf(PaginationLimitError)

    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it("accepts an explicitly complete inventory before the page cap", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: ["complete"],
      hasMore: false,
    })

    await expect(
      fetchAllItems(fetchPage, {
        pageSize: 1,
        maxPages: 1,
        requireComplete: true,
      }),
    ).resolves.toEqual(["complete"])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
