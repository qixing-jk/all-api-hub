import { beforeEach, describe, expect, it, vi } from "vitest"

const mockFetchSiteUserGroups = vi.fn()

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
      fetchSiteUserGroups: mockFetchSiteUserGroups,
      getConfig: async () => ({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
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
      fetchSiteUserGroups: mockFetchSiteUserGroups,
      getConfig: async () => ({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
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
      fetchSiteUserGroups: mockFetchSiteUserGroups,
      getConfig: async () => ({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
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
      fetchSiteUserGroups: mockFetchSiteUserGroups,
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
      fetchSiteUserGroups: mockFetchSiteUserGroups,
      getConfig: async () => ({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      }),
      onError,
    })

    expect(result).toEqual(["default"])
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("reuses the same in-flight default group lookup within an operation context", async () => {
    const { createManagedSiteOperationContext } = await import(
      "~/services/managedSites/operationContext"
    )
    const { resolveDefaultChannelGroups } = await import(
      "~/services/managedSites/providers/defaultChannelGroups"
    )

    mockFetchSiteUserGroups.mockResolvedValueOnce(["vip", "Default"])

    const operationContext = createManagedSiteOperationContext()
    const getConfig = vi.fn(async () => ({
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "1",
    }))

    const [first, second] = await Promise.all([
      resolveDefaultChannelGroups({
        fetchSiteUserGroups: mockFetchSiteUserGroups,
        getConfig,
        operationContext,
      }),
      resolveDefaultChannelGroups({
        fetchSiteUserGroups: mockFetchSiteUserGroups,
        getConfig,
        operationContext,
      }),
    ])

    expect(first).toEqual(["Default"])
    expect(second).toEqual(["Default"])
    expect(getConfig).toHaveBeenCalledTimes(1)
    expect(mockFetchSiteUserGroups).toHaveBeenCalledTimes(1)
  })
})
