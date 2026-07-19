import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidVeloeraConfig,
  prepareChannelFormData,
} from "~/services/managedSites/providers/veloera"
import { AuthTypeEnum } from "~/types"
import { CHANNEL_STATUS, type ChannelFormData } from "~/types/managedSite"
import type { ManagedSiteChannel } from "~/types/managedSite"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const veloeraApi = vi.hoisted(() => ({
  searchChannel: vi.fn(),
  listAllChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchChannel: vi.fn(),
  fetchChannelModels: vi.fn(),
  updateChannelModels: vi.fn(),
  updateChannelModelMapping: vi.fn(),
}))

const keyManagement = vi.hoisted(() => ({
  defaultKeyManagementImplementation: {
    fetchAccountTokens: vi.fn(),
    createApiToken: vi.fn(),
    updateApiToken: vi.fn(),
    resolveApiTokenKey: vi.fn(),
    deleteApiToken: vi.fn(),
    fetchUserGroups: vi.fn(),
    fetchAccountAvailableModels: vi.fn(),
  },
  fetchAccountAvailableModels: vi.fn(),
  fetchSiteUserGroups: vi.fn(),
}))

const managedSiteModels = vi.hoisted(() => ({
  fetchManagedSiteAvailableModels: vi.fn(),
}))

vi.mock("~/services/apiService/veloera", () => ({
  ...veloeraApi,
}))

vi.mock("~/services/apiService/newApiFamily/default/keyManagement", () => ({
  ...keyManagement,
}))

vi.mock(
  "~/services/managedSites/utils/fetchManagedSiteAvailableModels",
  () => ({
    ...managedSiteModels,
  }),
)

describe("Veloera managed-site channel capability", () => {
  const config = {
    baseUrl: "https://veloera.example.invalid",
    adminToken: "admin-token",
    userId: "42",
  }
  const buildManagedSiteChannel = (
    overrides: Partial<ManagedSiteChannel> = {},
  ): ManagedSiteChannel =>
    ({
      id: 7,
      type: 1,
      key: "sk-live-channel-key",
      name: "Example Channel",
      base_url: "https://upstream.example.invalid",
      models: "gpt-4o,gpt-4o-mini",
      status: 1,
      weight: 11,
      priority: 13,
      openai_organization: null,
      test_model: null,
      created_time: 0,
      test_time: 0,
      response_time: 0,
      other: "advanced",
      balance: 0,
      balance_updated_time: 0,
      group: "default,vip",
      used_quota: 0,
      model_mapping: '{"gpt-4o":"upstream-gpt-4o"}',
      status_code_mapping: '{"429":"quota"}',
      auto_ban: 1,
      other_info: '{"status_reason":"ok"}',
      tag: "tag-a",
      param_override: { temperature: 0.2 },
      header_override: { "x-provider": "example" },
      remark: "keep me",
      channel_info: {
        is_multi_key: false,
        multi_key_size: 0,
        multi_key_status_list: null,
        multi_key_polling_index: 0,
        multi_key_mode: "",
      },
      setting: '{"proxy":"on"}',
      settings: '{"retry":2}',
      ...overrides,
    }) satisfies ManagedSiteChannel

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates channel operations to direct Veloera helpers", async () => {
    const { veloeraManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    await veloeraManagedSiteChannels.search(config, "keyword")
    await veloeraManagedSiteChannels.list?.(config, {
      beforeRequest: vi.fn(),
      bypassSiteRequestLimit: true,
    })
    await veloeraManagedSiteChannels.create(config, {
      mode: "single",
      channel: { name: "channel", status: 1 },
    })
    await veloeraManagedSiteChannels.update(config, { id: 1 })
    await veloeraManagedSiteChannels.delete(config, 1)
    const fetchModelsSignal = new AbortController().signal
    await veloeraManagedSiteChannels.fetchModels?.(config, 1, {
      signal: fetchModelsSignal,
    })
    await veloeraManagedSiteChannels.updateModels?.(
      config,
      1,
      ["gpt-4o", "claude-3"],
      { signal: new AbortController().signal },
    )
    await veloeraManagedSiteChannels.updateModelMapping?.(
      config,
      1,
      ["gpt-4o", "claude-3"],
      { "gpt-4o": "gpt-4o" },
      { signal: new AbortController().signal },
    )

    expect(veloeraApi.searchChannel).toHaveBeenCalledWith(request, "keyword")
    expect(veloeraApi.listAllChannels).toHaveBeenCalledWith(
      { ...request, bypassSiteRequestLimit: true },
      {
        beforeRequest: expect.any(Function),
        bypassSiteRequestLimit: true,
      },
    )
    expect(veloeraApi.createChannel).toHaveBeenCalledWith(request, {
      mode: "single",
      channel: { name: "channel", status: 1 },
    })
    expect(veloeraApi.updateChannel).toHaveBeenCalledWith(request, { id: 1 })
    expect(veloeraApi.deleteChannel).toHaveBeenCalledWith(request, 1)
    expect(veloeraApi.fetchChannelModels).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
      { signal: fetchModelsSignal },
    )
    expect(veloeraApi.updateChannelModels).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
      "gpt-4o,claude-3",
      { signal: expect.any(AbortSignal) },
    )
    expect(veloeraApi.updateChannelModelMapping).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
      "gpt-4o,claude-3",
      JSON.stringify({ "gpt-4o": "gpt-4o" }),
      { signal: expect.any(AbortSignal) },
    )
  })

  it("exposes provider config and draft functions", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )

    expect(veloeraManagedSiteCapabilities.resources).toEqual({
      items: {
        list: expect.any(Function),
        search: expect.any(Function),
        getDetail: expect.any(Function),
        create: expect.any(Function),
        update: expect.any(Function),
        delete: expect.any(Function),
      },
      drafts: {
        prepareImportDraft: expect.any(Function),
        prepareEditDraft: expect.any(Function),
        describeFields: expect.any(Function),
        validateDraft: expect.any(Function),
      },
      secrets: {
        revealSecret: expect.any(Function),
      },
    })
    expect(veloeraManagedSiteCapabilities.config.checkValid).toBe(
      checkValidVeloeraConfig,
    )
    expect(veloeraManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: expect.any(Function),
      buildName: buildChannelName,
      prepareFormData: prepareChannelFormData,
      buildPayload: buildChannelPayload,
    })
    expect(veloeraManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("delegates Veloera queries and comparable-key hydration helpers", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    await veloeraManagedSiteCapabilities.queries.fetchSiteUserGroups(config)
    await veloeraManagedSiteCapabilities.queries.fetchAccountAvailableModels(
      config,
    )

    expect(keyManagement.fetchSiteUserGroups).toHaveBeenCalledWith(request)
    expect(keyManagement.fetchAccountAvailableModels).toHaveBeenCalledWith(
      request,
    )

    veloeraApi.fetchChannel.mockResolvedValueOnce({
      id: 42,
      key: "veloera-secret",
    })
    await expect(
      veloeraManagedSiteCapabilities.channels.fetchSecretKey?.(config, 42),
    ).resolves.toBe("veloera-secret")
    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(request, 42)

    veloeraApi.fetchChannel.mockResolvedValueOnce({
      id: 7,
      key: "veloera-hydrated",
    })
    await expect(
      veloeraManagedSiteCapabilities.channels.hydrateComparableKeys?.(config, [
        { id: 1, key: "sk-live" },
        { id: 7, key: "sk-********" },
      ] as never),
    ).resolves.toEqual([
      { id: 1, key: "sk-live" },
      { id: 7, key: "veloera-hydrated" },
    ])
    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(request, 7)
  })

  it("injects Veloera account model fallback into the provider draft capability", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const account = buildDisplaySiteData({
      id: "1",
      siteType: "Veloera",
      baseUrl: config.baseUrl,
    })
    const token = buildApiToken({
      id: 10,
      name: "token",
      key: "token-key",
    })

    await veloeraManagedSiteCapabilities.channelDrafts.fetchAvailableModels(
      account,
      token,
    )

    expect(
      managedSiteModels.fetchManagedSiteAvailableModels,
    ).toHaveBeenCalledWith(account, token, {
      fetchAccountAvailableModels: keyManagement.fetchAccountAvailableModels,
    })
  })

  it("maps Veloera list and search results to stable core resource summaries", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const maskedChannel = buildManagedSiteChannel({
      id: 12,
      key: "sk-********",
      name: "Masked Veloera Channel",
      status: 3,
    })
    const liveChannel = buildManagedSiteChannel({
      id: 13,
      key: "sk-live-channel-key",
      name: "Live Veloera Channel",
      status: 2,
    })
    veloeraApi.listAllChannels.mockResolvedValue({
      items: [maskedChannel],
      total: 1,
      type_counts: {},
    })
    veloeraApi.searchChannel.mockResolvedValue({
      items: [liveChannel],
      total: 1,
      type_counts: {},
    })

    const list =
      await veloeraManagedSiteCapabilities.resources.items.list(config)
    const search = await veloeraManagedSiteCapabilities.resources.items.search(
      config,
      "veloera",
    )

    expect(list).toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Masked Veloera Channel",
          nativeKind: "channel",
          status: "auto_disabled",
          endpointLabel: "https://upstream.example.invalid",
          modelCount: 2,
          modelPreview: ["gpt-4o", "gpt-4o-mini"],
          secretState: "masked",
          ref: {
            managedSiteType: SITE_TYPES.VELOERA,
            scopeKey: "https://veloera.example.invalid",
            resourceId: "12",
          },
        }),
      ],
    })
    expect(search?.items[0]).toEqual(
      expect.objectContaining({
        displayName: "Live Veloera Channel",
        status: "disabled",
        secretState: "available",
        ref: {
          managedSiteType: SITE_TYPES.VELOERA,
          scopeKey: "https://veloera.example.invalid",
          resourceId: "13",
        },
      }),
    )
  })

  it("exposes Veloera resource secret reveal when summaries advertise reveal support", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const channel = buildManagedSiteChannel({
      id: 14,
      key: "sk-********",
      name: "Revealable Veloera Channel",
    })
    veloeraApi.listAllChannels.mockResolvedValue({
      items: [channel],
      total: 1,
      type_counts: {},
    })
    veloeraApi.fetchChannel.mockResolvedValue({
      ...channel,
      key: "sk-revealed-veloera-key",
    })

    const list =
      await veloeraManagedSiteCapabilities.resources.items.list(config)

    expect(list.items[0].capabilities.canRevealSecret).toBe(true)
    expect(
      veloeraManagedSiteCapabilities.resources.secrets?.revealSecret,
    ).toEqual(expect.any(Function))
    await expect(
      veloeraManagedSiteCapabilities.resources.secrets?.revealSecret(
        config,
        list.items[0].ref,
      ),
    ).resolves.toEqual({
      status: "available",
      secret: "sk-revealed-veloera-key",
    })
    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(
      {
        baseUrl: config.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: config.adminToken,
          userId: config.userId,
        },
      },
      14,
    )
  })

  it("returns masked and unavailable Veloera secret reveal states", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const ref = {
      managedSiteType: SITE_TYPES.VELOERA,
      scopeKey: "https://veloera.example.invalid",
      resourceId: "15",
    } as const

    veloeraApi.fetchChannel
      .mockResolvedValueOnce({ id: 15, key: "sk-********" })
      .mockResolvedValueOnce({ id: 15, key: "" })

    await expect(
      veloeraManagedSiteCapabilities.resources.secrets?.revealSecret(
        config,
        ref,
      ),
    ).resolves.toEqual({ status: "masked" })
    await expect(
      veloeraManagedSiteCapabilities.resources.secrets?.revealSecret(
        config,
        ref,
      ),
    ).resolves.toEqual({ status: "unavailable" })
  })

  it("returns null for Veloera resource search misses", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    veloeraApi.searchChannel.mockResolvedValue(null)

    await expect(
      veloeraManagedSiteCapabilities.resources.items.search(config, "missing"),
    ).resolves.toBeNull()
  })

  it("loads Veloera resource detail from fetchChannel and prepares edit drafts from native detail", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const native = buildManagedSiteChannel({
      id: 19,
      key: "sk-detail-key",
      name: "Detailed Veloera Channel",
    })
    veloeraApi.fetchChannel.mockResolvedValue(native)

    const detail =
      await veloeraManagedSiteCapabilities.resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.VELOERA,
        scopeKey: "https://veloera.example.invalid",
        resourceId: "19",
      })
    const draft =
      veloeraManagedSiteCapabilities.resources.drafts.prepareEditDraft(detail)

    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(
      {
        baseUrl: config.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: config.adminToken,
          userId: config.userId,
        },
      },
      19,
    )
    expect(detail).toEqual({
      summary: expect.objectContaining({
        displayName: "Detailed Veloera Channel",
        ref: {
          managedSiteType: SITE_TYPES.VELOERA,
          scopeKey: "https://veloera.example.invalid",
          resourceId: "19",
        },
      }),
      native,
    })
    expect(draft).toEqual({
      name: "Detailed Veloera Channel",
      type: native.type,
      key: "sk-detail-key",
      base_url: "https://upstream.example.invalid",
      models: ["gpt-4o", "gpt-4o-mini"],
      groups: ["default", "vip"],
      priority: 13,
      weight: 11,
      status: 1,
    })
  })

  it("updates Veloera resource drafts by preserving native fields and omitting masked keys", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    veloeraApi.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const native = buildManagedSiteChannel({
      id: 21,
      key: "sk-********",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.VELOERA,
          scopeKey: "https://veloera.example.invalid",
          resourceId: "21",
        },
        displayName: native.name,
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native,
    } as const

    await veloeraManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        name: "Edited Veloera Channel",
        type: native.type,
        key: "sk-********",
        base_url: "https://edited-upstream.example.invalid",
        models: ["gpt-4o-mini"],
        groups: ["vip"],
        priority: 21,
        weight: 34,
        status: 2,
      },
    )

    expect(veloeraApi.updateChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 21,
        name: "Edited Veloera Channel",
        base_url: "https://edited-upstream.example.invalid",
        models: "gpt-4o-mini",
        groups: ["vip"],
        group: "vip",
        priority: 21,
        weight: 34,
        status: 2,
        model_mapping: '{"gpt-4o":"upstream-gpt-4o"}',
        status_code_mapping: '{"429":"quota"}',
        setting: '{"proxy":"on"}',
        settings: '{"retry":2}',
        other: "advanced",
        tag: "tag-a",
      }),
    )
    expect(veloeraApi.updateChannel.mock.calls.at(-1)?.[1]).not.toHaveProperty(
      "key",
    )
  })

  it("writes a Veloera resource key only when the draft contains a usable user-supplied key", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    veloeraApi.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const native = buildManagedSiteChannel({
      id: 22,
      key: "sk-********",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.VELOERA,
          scopeKey: "https://veloera.example.invalid",
          resourceId: "22",
        },
        displayName: native.name,
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native,
    } as const

    await veloeraManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        name: native.name,
        type: native.type,
        key: "  sk-replacement-key  ",
        base_url: native.base_url,
        models: ["gpt-4o"],
        groups: ["default"],
        priority: native.priority,
        weight: native.weight,
        status: native.status,
      },
    )

    expect(veloeraApi.updateChannel.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        key: "sk-replacement-key",
      }),
    )
  })

  it("delegates Veloera resource create and delete to existing channel operations", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    veloeraApi.createChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    veloeraApi.deleteChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const draft: ChannelFormData = {
      name: "Created Veloera Channel",
      type: 1,
      key: "sk-created",
      base_url: "https://created.example.invalid",
      models: ["gpt-4o"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: CHANNEL_STATUS.Enable,
    }

    await veloeraManagedSiteCapabilities.resources.items.create(config, draft)
    await veloeraManagedSiteCapabilities.resources.items.delete(config, {
      managedSiteType: SITE_TYPES.VELOERA,
      scopeKey: "https://veloera.example.invalid",
      resourceId: "25",
    })

    expect(veloeraApi.createChannel).toHaveBeenCalledWith(
      expect.anything(),
      buildChannelPayload(draft),
    )
    expect(veloeraApi.deleteChannel).toHaveBeenCalledWith(expect.anything(), 25)
  })

  it("prepares and validates Veloera resource import drafts", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const sourceDraft: ChannelFormData = {
      name: "Source",
      type: 1,
      key: "sk-source",
      base_url: "https://source.example.invalid",
      models: ["gpt-4o"],
      groups: ["vip"],
      priority: 1,
      weight: 2,
      status: CHANNEL_STATUS.Enable,
    }

    await expect(
      veloeraManagedSiteCapabilities.resources.drafts.prepareImportDraft({
        source: sourceDraft,
      }),
    ).resolves.toBe(sourceDraft)
    await expect(
      veloeraManagedSiteCapabilities.resources.drafts.prepareImportDraft({
        resource: {
          ref: {
            managedSiteType: SITE_TYPES.VELOERA,
            scopeKey: "https://veloera.example.invalid",
            resourceId: "34",
          },
          displayName: "Imported Veloera",
          nativeKind: "channel",
          status: "enabled",
          endpointLabel: "https://imported.example.invalid",
          modelPreview: ["gpt-4o-mini"],
          secretState: "masked",
          capabilities: {},
        },
      }),
    ).resolves.toEqual({
      name: "Imported Veloera",
      type: 1,
      key: "",
      base_url: "https://imported.example.invalid",
      models: ["gpt-4o-mini"],
      groups: [],
      priority: 0,
      weight: 0,
      status: CHANNEL_STATUS.Enable,
    })
    expect(
      veloeraManagedSiteCapabilities.resources.drafts.validateDraft({
        ...sourceDraft,
        name: "",
        models: [],
      }),
    ).toEqual({
      valid: false,
      errors: [
        { field: "name", message: "Channel name is required" },
        { field: "models", message: "At least one model is required" },
      ],
    })
  })
})
