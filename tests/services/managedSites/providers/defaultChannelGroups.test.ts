import { beforeEach, describe, expect, it, vi } from "vitest"

const mockFetchSiteUserGroups = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchSiteUserGroups: mockFetchSiteUserGroups,
  })),
}))

describe("resolveDefaultChannelGroups", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("prefers the managed site's default group case-insensitively", async () => {
    const { resolveDefaultChannelGroups } = await import(
      "~/services/managedSites/providers/defaultChannelGroups"
    )

    mockFetchSiteUserGroups.mockResolvedValueOnce(["vip", "Default"])

    const result = await resolveDefaultChannelGroups({
      siteType: "new-api",
      getConfig: async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      }),
    })

    expect(result).toEqual(["Default"])
  })

  it("falls back to default when the managed site returns no groups", async () => {
    const { resolveDefaultChannelGroups } = await import(
      "~/services/managedSites/providers/defaultChannelGroups"
    )

    mockFetchSiteUserGroups.mockResolvedValueOnce([])

    const result = await resolveDefaultChannelGroups({
      siteType: "new-api",
      getConfig: async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      }),
    })

    expect(result).toEqual(["default"])
  })

  it("falls back to the first managed-site group when default is absent", async () => {
    const { resolveDefaultChannelGroups } = await import(
      "~/services/managedSites/providers/defaultChannelGroups"
    )

    mockFetchSiteUserGroups.mockResolvedValueOnce(["vip", "beta"])

    const result = await resolveDefaultChannelGroups({
      siteType: "Veloera",
      getConfig: async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      }),
    })

    expect(result).toEqual(["vip"])
  })

  it("falls back to default when managed-site config is unavailable", async () => {
    const { resolveDefaultChannelGroups } = await import(
      "~/services/managedSites/providers/defaultChannelGroups"
    )

    const result = await resolveDefaultChannelGroups({
      siteType: "done-hub",
      getConfig: async () => null,
    })

    expect(result).toEqual(["default"])
    expect(mockFetchSiteUserGroups).not.toHaveBeenCalled()
  })

  it("falls back to default when fetching managed-site groups fails", async () => {
    const { resolveDefaultChannelGroups } = await import(
      "~/services/managedSites/providers/defaultChannelGroups"
    )

    const onError = vi.fn()
    mockFetchSiteUserGroups.mockRejectedValueOnce(new Error("boom"))

    const result = await resolveDefaultChannelGroups({
      siteType: "new-api",
      getConfig: async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      }),
      onError,
    })

    expect(result).toEqual(["default"])
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
