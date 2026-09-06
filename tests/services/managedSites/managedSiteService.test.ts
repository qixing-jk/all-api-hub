import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"

const mockGetSiteTypeCapabilities = vi.hoisted(() => vi.fn())

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: mockGetSiteTypeCapabilities,
}))

const buildCapabilities = (overrides?: {
  createChannel?: (config: unknown, channelData: unknown) => Promise<unknown>
  updateChannel?: (config: unknown, channelData: unknown) => Promise<unknown>
  deleteChannel?: (config: unknown, channelId: number) => Promise<unknown>
  list?: false | ((config: unknown, options?: unknown) => Promise<unknown>)
  search?: (config: unknown, keyword: string) => Promise<unknown>
}) => ({
  managedSites: {
    matching: { search: overrides?.search ?? vi.fn() },
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
      create: overrides?.createChannel ?? vi.fn(),
      update: overrides?.updateChannel ?? vi.fn(),
      delete: overrides?.deleteChannel ?? vi.fn(),
    },
    config: {
      checkValid: vi.fn(),
      get: vi.fn(),
    },
    queries: {
      siteUserGroups: { fetch: vi.fn().mockResolvedValue([]) },
      accountAvailableModels: { fetch: vi.fn().mockResolvedValue([]) },
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
      service.fetchSiteUserGroups!({
        baseUrl: "https://managed.example.invalid",
        email: "admin@example.invalid",
        password: "password",
      }),
    ).resolves.toEqual([])
    await expect(
      service.fetchAccountAvailableModels!({
        baseUrl: "https://managed.example.invalid",
        email: "admin@example.invalid",
        password: "password",
      }),
    ).resolves.toEqual([])
  })
})
