import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"

const mockGetSiteTypeCapabilities = vi.hoisted(() => vi.fn())

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: mockGetSiteTypeCapabilities,
}))

const buildCapabilities = (overrides?: {
  list?: false | ((config: unknown, options?: unknown) => Promise<unknown>)
  search?: (config: unknown, keyword: string) => Promise<unknown>
}) => ({
  managedSites: {
    channels: {
      search:
        overrides?.search ??
        vi.fn().mockResolvedValue({ items: [], total: 0, type_counts: {} }),
      ...(overrides?.list === false
        ? {}
        : {
            list:
              overrides?.list ??
              vi
                .fn()
                .mockResolvedValue({ items: [], total: 0, type_counts: {} }),
          }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    config: {
      checkValid: vi.fn(),
      get: vi.fn(),
    },
    queries: {
      fetchSiteUserGroups: vi.fn().mockResolvedValue([]),
      fetchAccountAvailableModels: vi.fn().mockResolvedValue([]),
    },
    channelDrafts: {
      fetchAvailableModels: vi.fn(),
      buildName: vi.fn(),
      prepareFormData: vi.fn(),
      buildPayload: vi.fn(),
    },
  },
})

describe("managed site service facade", () => {
  beforeEach(() => {
    mockGetSiteTypeCapabilities.mockReset()
    mockGetSiteTypeCapabilities.mockReturnValue(buildCapabilities())
  })

  it("exposes managed-site query capabilities on typed services", async () => {
    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )
    const service = getManagedSiteServiceForType(SITE_TYPES.AXON_HUB)

    await expect(
      service.fetchSiteUserGroups({
        baseUrl: "https://managed.example.invalid",
        email: "admin@example.invalid",
        password: "password",
      }),
    ).resolves.toEqual([])
    await expect(
      service.fetchAccountAvailableModels({
        baseUrl: "https://managed.example.invalid",
        email: "admin@example.invalid",
        password: "password",
      }),
    ).resolves.toEqual([])
  })

  it("lists channels through the managed-site list capability with options", async () => {
    const list = vi.fn().mockResolvedValue({
      items: [{ id: 1, name: "Alpha" }],
      total: 1,
      type_counts: {},
    })
    mockGetSiteTypeCapabilities.mockReturnValue(buildCapabilities({ list }))

    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )
    const service = getManagedSiteServiceForType(SITE_TYPES.AXON_HUB)
    const signal = new AbortController().signal
    const config = {
      baseUrl: "https://managed.example.invalid",
      email: "admin@example.invalid",
      password: "password",
    }

    await expect(service.listChannels(config, { signal })).resolves.toEqual({
      items: [{ id: 1, name: "Alpha" }],
      total: 1,
      type_counts: {},
    })
    expect(list).toHaveBeenCalledWith(config, { signal })
  })

  it("falls back to search when list is unavailable and normalizes empty results", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        items: [{ id: 2, name: "Beta" }],
        total: 1,
        type_counts: {},
      })
    mockGetSiteTypeCapabilities.mockReturnValue(
      buildCapabilities({ list: false, search }),
    )

    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )
    const service = getManagedSiteServiceForType(SITE_TYPES.CLAUDE_CODE_HUB)
    const config = {
      baseUrl: "https://managed.example.invalid",
      adminToken: "token",
    }

    await expect(service.listChannels(config)).resolves.toEqual({
      items: [],
      total: 0,
      type_counts: {},
    })
    await expect(service.listChannels(config)).resolves.toEqual({
      items: [{ id: 2, name: "Beta" }],
      total: 1,
      type_counts: {},
    })
    expect(search).toHaveBeenCalledWith(config, "")
  })
})
