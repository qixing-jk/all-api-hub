import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAccountSearch } from "~/features/AccountManagement/hooks/useAccountSearch"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const {
  mockCompareAccountDisplayNames,
  mockNormalizeSearchText,
  mockNormalizeSearchUrl,
  mockSearchAccounts,
} = vi.hoisted(() => ({
  mockCompareAccountDisplayNames: vi.fn(),
  mockNormalizeSearchText: vi.fn((value: string) => value.trim().toLowerCase()),
  mockNormalizeSearchUrl: vi.fn((value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, ""),
  ),
  mockSearchAccounts: vi.fn(),
}))

vi.mock("~/services/accounts/utils/accountDisplayName", () => ({
  compareAccountDisplayNames: mockCompareAccountDisplayNames,
}))

vi.mock("~/services/search/accountSearch", () => ({
  normalizeSearchText: mockNormalizeSearchText,
  normalizeSearchUrl: mockNormalizeSearchUrl,
  searchAccounts: mockSearchAccounts,
}))

const accountAlpha = {
  id: "a1",
  name: "Alpha Account",
  baseUrl: "https://alpha.example.com",
  username: "alice",
  tags: ["Priority", "Team A"],
  last_sync_time: 100,
  checkIn: {
    customCheckIn: {
      url: "https://alpha.example.com/check-in",
      redeemUrl: "https://alpha.example.com/redeem",
    },
  },
}

const accountBeta = {
  id: "b1",
  name: "Beta Account",
  baseUrl: "https://beta.example.com",
  username: "bob",
  tags: ["Priority"],
  last_sync_time: 200,
  checkIn: {
    customCheckIn: {
      url: "https://beta.example.com/check-in",
      redeemUrl: "https://beta.example.com/redeem",
    },
  },
}

describe("useAccountSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockSearchAccounts.mockReturnValue([])
    mockCompareAccountDisplayNames.mockImplementation((a, b) =>
      a.name.localeCompare(b.name),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps search inactive for blank queries and clears state immediately", async () => {
    const { result } = renderHook(() => useAccountSearch([accountAlpha as any]))

    expect(result.current.query).toBe("")
    expect(result.current.debouncedQuery).toBe("")
    expect(result.current.searchResults).toEqual([])
    expect(result.current.inSearchMode).toBe(false)

    await act(async () => {
      result.current.setQuery("alpha")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })

    expect(mockSearchAccounts).toHaveBeenCalledWith([accountAlpha], "alpha")
    expect(result.current.inSearchMode).toBe(true)

    await act(async () => {
      result.current.clearSearch()
    })

    expect(result.current.query).toBe("")
    expect(result.current.debouncedQuery).toBe("")
    expect(result.current.searchResults).toEqual([])
    expect(result.current.inSearchMode).toBe(false)
  })

  it("debounces queries and sorts results by score, sync time, then display name", async () => {
    mockSearchAccounts.mockReturnValue([
      {
        account: { ...accountAlpha },
        score: 10,
        matchedFields: ["name"],
      },
      {
        account: { ...accountBeta },
        score: 10,
        matchedFields: ["name"],
      },
      {
        account: {
          ...accountAlpha,
          id: "a2",
          name: "Aardvark Account",
          last_sync_time: 200,
        },
        score: 5,
        matchedFields: ["name"],
      },
    ])

    const { result } = renderHook(() =>
      useAccountSearch([accountAlpha as any, accountBeta as any]),
    )

    await act(async () => {
      result.current.setQuery("Priority")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(149)
    })

    expect(mockSearchAccounts).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(mockSearchAccounts).toHaveBeenCalledWith(
      [accountAlpha, accountBeta],
      "Priority",
    )
    expect(
      result.current.searchResults.map((item) => item.account.name),
    ).toEqual(["Beta Account", "Alpha Account", "Aardvark Account"])
  })

  it("generates field-specific highlight fragments for matched result fields", async () => {
    mockSearchAccounts.mockReturnValue([
      {
        account: { ...accountAlpha },
        score: 20,
        matchedFields: [
          "name",
          "baseUrl",
          "customCheckInUrl",
          "customRedeemUrl",
          "username",
          "tags",
        ],
      },
    ])

    const { result } = renderHook(() =>
      useAccountSearch([accountAlpha as any], "Alpha alice priority redeem"),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })

    const destructuredSource0 = result.current.searchResults
    const [searchResult] = [atIndex(destructuredSource0, 0)]
    expect(searchResult.highlights.name).toEqual([
      { text: "Alpha", highlighted: true },
      { text: " Account", highlighted: false },
    ])
    expect(searchResult.highlights.baseUrl).toEqual([
      { text: "https://", highlighted: false },
      { text: "alpha", highlighted: true },
      { text: ".example.com", highlighted: false },
    ])
    expect(searchResult.highlights.customCheckInUrl).toEqual(
      expect.arrayContaining([{ text: "alpha", highlighted: true }]),
    )
    expect(searchResult.highlights.customRedeemUrl).toEqual(
      expect.arrayContaining([{ text: "redeem", highlighted: true }]),
    )
    expect(searchResult.highlights.username).toEqual([
      { text: "alice", highlighted: true },
    ])
    expect(searchResult.highlights.tags).toEqual(
      expect.arrayContaining([{ text: "Priority", highlighted: true }]),
    )
  })

  it("applies updated initialQuery values immediately on rerender", async () => {
    mockSearchAccounts.mockReturnValue([
      {
        account: { ...accountAlpha },
        score: 10,
        matchedFields: ["name"],
      },
    ])

    const { result, rerender } = renderHook(
      ({ initialQuery }) =>
        useAccountSearch([accountAlpha as any], initialQuery),
      {
        initialProps: { initialQuery: "alpha" },
      },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })

    expect(result.current.query).toBe("alpha")
    expect(result.current.debouncedQuery).toBe("alpha")

    rerender({ initialQuery: "beta" })

    expect(result.current.query).toBe("beta")
    expect(result.current.debouncedQuery).toBe("beta")
    expect(mockSearchAccounts).toHaveBeenLastCalledWith([accountAlpha], "beta")
  })
})
