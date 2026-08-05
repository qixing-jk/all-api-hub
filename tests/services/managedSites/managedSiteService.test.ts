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

  it("returns uncertain delete outcomes without converting the common result", async () => {
    const raw = { token: "must-not-leak" }
    const deleteChannel = vi.fn().mockResolvedValue({
      outcome: "uncertain",
      diagnostic: {
        message: "transport unavailable: password",
        raw,
      },
    })
    mockGetSiteTypeCapabilities.mockReturnValue(
      buildCapabilities({ deleteChannel }),
    )

    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )
    const service = getManagedSiteServiceForType(SITE_TYPES.AXON_HUB)
    const config = {
      baseUrl: "https://managed.example.invalid",
      email: "admin@example.invalid",
      password: "password",
    }

    await expect(service.deleteChannel(config, 7)).resolves.toEqual({
      outcome: "uncertain",
      diagnostic: {
        message: "transport unavailable: password",
        raw,
      },
    })
    expect(deleteChannel).toHaveBeenCalledWith(config, 7)
  })

  it("returns partial mutations without converting the common result", async () => {
    const updateChannel = vi.fn().mockResolvedValue({
      outcome: "partial",
      confirmedEffects: [
        {
          kind: "resource-updated",
          resourceKind: "channel",
          resourceId: 7,
        },
      ],
      completion: "rejected",
      diagnostic: {
        message: "status rejected",
        raw: { provider: "private" },
      },
    })
    mockGetSiteTypeCapabilities.mockReturnValue(
      buildCapabilities({ updateChannel }),
    )

    const { getManagedSiteServiceForType } = await import(
      "~/services/managedSites/managedSiteService"
    )
    const service = getManagedSiteServiceForType(SITE_TYPES.NEW_API)
    const config = {
      baseUrl: "https://managed.example.invalid",
      userId: "1",
      adminToken: "secret-token",
    }

    await expect(service.updateChannel(config, { id: 7 })).resolves.toEqual({
      outcome: "partial",
      confirmedEffects: [
        {
          kind: "resource-updated",
          resourceKind: "channel",
          resourceId: 7,
        },
      ],
      completion: "rejected",
      diagnostic: {
        message: "status rejected",
        raw: { provider: "private" },
      },
    })
  })

  it.each([["create"], ["update"]] as const)(
    "returns the %s rejection as the provider-neutral internal result",
    async (operation) => {
      const opaqueChannelKey = "opaque-reserved-placeholder"
      const mutateChannel = vi.fn().mockResolvedValue({
        outcome: "rejected",
        diagnostic: {
          message: `upstream rejected ${opaqueChannelKey}`,
          raw: { message: opaqueChannelKey },
        },
      })
      mockGetSiteTypeCapabilities.mockReturnValue(
        buildCapabilities(
          operation === "create"
            ? { createChannel: mutateChannel }
            : { updateChannel: mutateChannel },
        ),
      )

      const { getManagedSiteServiceForType } = await import(
        "~/services/managedSites/managedSiteService"
      )
      const service = getManagedSiteServiceForType(SITE_TYPES.NEW_API)
      const config = {
        baseUrl: "https://managed.example.invalid",
        userId: "1",
        adminToken: "admin-token",
      }
      const result =
        operation === "create"
          ? await service.createChannel(config, {
              mode: "single",
              channel: { key: opaqueChannelKey, status: 1 },
            })
          : await service.updateChannel(config, {
              id: 7,
              key: opaqueChannelKey,
            })

      expect(result).toEqual({
        outcome: "rejected",
        diagnostic: {
          message: `upstream rejected ${opaqueChannelKey}`,
          raw: { message: opaqueChannelKey },
        },
      })
    },
  )
})
