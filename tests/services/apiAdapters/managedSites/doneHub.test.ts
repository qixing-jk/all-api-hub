import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidDoneHubConfig,
  prepareChannelFormData,
} from "~/services/managedSites/providers/doneHubService"
import { AuthTypeEnum } from "~/types"
import { CHANNEL_STATUS, type ChannelFormData } from "~/types/managedSite"
import type { ManagedSiteChannel } from "~/types/managedSite"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const doneHubApi = vi.hoisted(() => ({
  searchChannel: vi.fn(),
  listAllChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchChannel: vi.fn(),
  fetchChannelRaw: vi.fn(),
  normalizeDoneHubChannel: vi.fn((channel) => channel),
  fetchChannelModels: vi.fn(),
  updateChannelModels: vi.fn(),
  updateChannelModelMapping: vi.fn(),
  fetchSiteUserGroups: vi.fn(),
}))

const newApiKeyManagement = vi.hoisted(() => {
  const doneHubKeyManagement = {
    fetchAvailableModels: vi.fn(),
  }

  return {
    doneHubKeyManagement,
    createNewApiKeyManagement: vi.fn(() => doneHubKeyManagement),
  }
})

const managedSiteModels = vi.hoisted(() => ({
  fetchManagedSiteAvailableModels: vi.fn(),
}))

vi.mock("~/services/apiService/doneHub", () => ({
  ...doneHubApi,
}))

vi.mock("~/services/apiAdapters/newApi/keyManagement", () => ({
  ...newApiKeyManagement,
}))

vi.mock(
  "~/services/managedSites/utils/fetchManagedSiteAvailableModels",
  () => ({
    ...managedSiteModels,
  }),
)

describe("DoneHub managed-site channel capability", () => {
  const config = {
    baseUrl: "https://done-hub.example.invalid",
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
      name: "Example DoneHub Channel",
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

  it("delegates channel operations and model sync to direct DoneHub helpers", async () => {
    const { doneHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    await doneHubManagedSiteChannels.search(config, "keyword")
    await doneHubManagedSiteChannels.list?.(config, {
      bypassSiteRequestLimit: true,
    })
    await doneHubManagedSiteChannels.create(config, {
      mode: "single",
      channel: { name: "channel", status: 1 },
    })
    await doneHubManagedSiteChannels.update(config, { id: 1 })
    await doneHubManagedSiteChannels.delete(config, 1)
    await doneHubManagedSiteChannels.fetchModels?.(config, 1)
    await doneHubManagedSiteChannels.updateModels?.(config, 1, ["model-a"])
    await doneHubManagedSiteChannels.updateModelMapping?.(
      config,
      1,
      ["model-a"],
      { "model-a": "upstream-model-a" },
    )

    expect(doneHubApi.searchChannel).toHaveBeenCalledWith(request, "keyword")
    expect(doneHubApi.listAllChannels).toHaveBeenCalledWith(
      { ...request, bypassSiteRequestLimit: true },
      { bypassSiteRequestLimit: true },
    )
    expect(doneHubApi.createChannel).toHaveBeenCalledWith(request, {
      mode: "single",
      channel: { name: "channel", status: 1 },
    })
    expect(doneHubApi.updateChannel).toHaveBeenCalledWith(request, { id: 1 })
    expect(doneHubApi.deleteChannel).toHaveBeenCalledWith(request, 1)
    expect(doneHubApi.fetchChannelModels).toHaveBeenCalledWith(
      request,
      1,
      undefined,
    )
    expect(doneHubApi.updateChannelModels).toHaveBeenCalledWith(
      request,
      1,
      "model-a",
      undefined,
    )
    expect(doneHubApi.updateChannelModelMapping).toHaveBeenCalledWith(
      request,
      1,
      "model-a",
      JSON.stringify({ "model-a": "upstream-model-a" }),
      undefined,
    )
  })

  it("delegates managed-site query helpers to direct DoneHub-compatible helpers", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    await doneHubManagedSiteCapabilities.queries.fetchSiteUserGroups(config)
    await doneHubManagedSiteCapabilities.queries.fetchAccountAvailableModels(
      config,
    )

    expect(doneHubApi.fetchSiteUserGroups).toHaveBeenCalledWith(request)
    expect(
      newApiKeyManagement.doneHubKeyManagement.fetchAvailableModels,
    ).toHaveBeenCalledWith(request)
  })

  it("fetches and hydrates DoneHub secret keys for masked comparable channels", async () => {
    const { doneHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    doneHubApi.fetchChannel.mockResolvedValueOnce({
      id: 42,
      key: "sk-real",
    })
    await expect(
      doneHubManagedSiteChannels.fetchSecretKey?.(config, 42),
    ).resolves.toBe("sk-real")
    expect(doneHubApi.fetchChannel).toHaveBeenCalledWith(request, 42)

    doneHubApi.fetchChannel.mockResolvedValueOnce({
      id: 7,
      key: "sk-hydrated",
    })
    await expect(
      doneHubManagedSiteChannels.hydrateComparableKeys?.(config, [
        { id: 1, key: "sk-live" },
        { id: 7, key: "sk-********" },
      ] as never),
    ).resolves.toEqual([
      { id: 1, key: "sk-live" },
      { id: 7, key: "sk-hydrated" },
    ])
    expect(doneHubApi.fetchChannel).toHaveBeenCalledWith(request, 7)
  })

  it("exposes provider config and draft functions", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )

    expect(doneHubManagedSiteCapabilities.config.checkValid).toBe(
      checkValidDoneHubConfig,
    )
    expect(doneHubManagedSiteCapabilities.resources).toEqual({
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
    expect(doneHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: expect.any(Function),
      buildName: buildChannelName,
      prepareFormData: prepareChannelFormData,
      buildPayload: buildChannelPayload,
    })
    expect(doneHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("injects DoneHub account model fallback into the provider draft capability", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const account = buildDisplaySiteData({
      id: "1",
      siteType: "done-hub",
      baseUrl: config.baseUrl,
    })
    const token = buildApiToken({
      id: 10,
      name: "token",
      key: "token-key",
    })

    await doneHubManagedSiteCapabilities.channelDrafts.fetchAvailableModels(
      account,
      token,
    )

    expect(
      managedSiteModels.fetchManagedSiteAvailableModels,
    ).toHaveBeenCalledWith(account, token, {
      fetchAccountAvailableModels:
        newApiKeyManagement.doneHubKeyManagement.fetchAvailableModels,
    })
  })

  it("maps DoneHub list and search results to stable core resource summaries", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const maskedChannel = buildManagedSiteChannel({
      id: 12,
      key: "sk-********",
      name: "Masked DoneHub Channel",
      status: 3,
    })
    const liveChannel = buildManagedSiteChannel({
      id: 13,
      key: "sk-live-channel-key",
      name: "Live DoneHub Channel",
      status: 2,
    })
    doneHubApi.listAllChannels.mockResolvedValue({
      items: [maskedChannel],
      total: 1,
      type_counts: {},
    })
    doneHubApi.searchChannel.mockResolvedValue({
      items: [liveChannel],
      total: 1,
      type_counts: {},
    })

    const list =
      await doneHubManagedSiteCapabilities.resources.items.list(config)
    const search = await doneHubManagedSiteCapabilities.resources.items.search(
      config,
      "done-hub",
    )

    expect(list).toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Masked DoneHub Channel",
          nativeKind: "channel",
          status: "auto_disabled",
          endpointLabel: "https://upstream.example.invalid",
          modelCount: 2,
          modelPreview: ["gpt-4o", "gpt-4o-mini"],
          secretState: "masked",
          ref: {
            managedSiteType: SITE_TYPES.DONE_HUB,
            scopeKey: "https://done-hub.example.invalid",
            resourceId: "12",
          },
        }),
      ],
    })
    expect(search?.items[0]).toEqual(
      expect.objectContaining({
        displayName: "Live DoneHub Channel",
        status: "disabled",
        secretState: "available",
        ref: {
          managedSiteType: SITE_TYPES.DONE_HUB,
          scopeKey: "https://done-hub.example.invalid",
          resourceId: "13",
        },
      }),
    )
  })

  it("exposes DoneHub resource secret reveal when summaries advertise reveal support", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const channel = buildManagedSiteChannel({
      id: 14,
      key: "sk-********",
      name: "Revealable DoneHub Channel",
    })
    doneHubApi.listAllChannels.mockResolvedValue({
      items: [channel],
      total: 1,
      type_counts: {},
    })
    doneHubApi.fetchChannel.mockResolvedValue({
      ...channel,
      key: "sk-revealed-donehub-key",
    })

    const list =
      await doneHubManagedSiteCapabilities.resources.items.list(config)

    expect(list.items[0].capabilities.canRevealSecret).toBe(true)
    expect(
      doneHubManagedSiteCapabilities.resources.secrets?.revealSecret,
    ).toEqual(expect.any(Function))
    await expect(
      doneHubManagedSiteCapabilities.resources.secrets?.revealSecret(
        config,
        list.items[0].ref,
      ),
    ).resolves.toEqual({
      status: "available",
      secret: "sk-revealed-donehub-key",
    })
    expect(doneHubApi.fetchChannel).toHaveBeenCalledWith(
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

  it("loads DoneHub resource detail from fetchChannel and prepares edit drafts from native detail", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const native = buildManagedSiteChannel({
      id: 19,
      key: "sk-detail-key",
      name: "Detailed DoneHub Channel",
    })
    doneHubApi.fetchChannelRaw.mockResolvedValue(native)

    const detail =
      await doneHubManagedSiteCapabilities.resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.DONE_HUB,
        scopeKey: "https://done-hub.example.invalid",
        resourceId: "19",
      })
    const draft =
      doneHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(detail)

    expect(doneHubApi.fetchChannelRaw).toHaveBeenCalledWith(
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
        displayName: "Detailed DoneHub Channel",
        ref: {
          managedSiteType: SITE_TYPES.DONE_HUB,
          scopeKey: "https://done-hub.example.invalid",
          resourceId: "19",
        },
      }),
      native,
    })
    expect(draft).toEqual({
      name: "Detailed DoneHub Channel",
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

  it("rejects stale DoneHub resource refs from a different site or scope before native access", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )

    await expect(
      doneHubManagedSiteCapabilities.resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.NEW_API,
        scopeKey: "https://done-hub.example.invalid",
        resourceId: "19",
      }),
    ).rejects.toThrow("Resource reference does not match this managed site")
    await expect(
      doneHubManagedSiteCapabilities.resources.items.delete(config, {
        managedSiteType: SITE_TYPES.DONE_HUB,
        scopeKey: "https://other.example.invalid",
        resourceId: "19",
      }),
    ).rejects.toThrow("Resource reference does not match this managed site")

    expect(doneHubApi.fetchChannelRaw).not.toHaveBeenCalled()
    expect(doneHubApi.deleteChannel).not.toHaveBeenCalled()
  })

  it("preserves DoneHub raw-only fields through resource edit updates while omitting masked keys", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    doneHubApi.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const normalizedNative = buildManagedSiteChannel({
      id: 24,
      key: "sk-********",
      name: "Raw Field DoneHub Channel",
    })
    const rawNative = {
      ...normalizedNative,
      proxy: "http://proxy.example.invalid:8080",
    }
    doneHubApi.fetchChannel.mockResolvedValue(normalizedNative)
    doneHubApi.fetchChannelRaw.mockResolvedValue(rawNative)

    const detail =
      await doneHubManagedSiteCapabilities.resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.DONE_HUB,
        scopeKey: "https://done-hub.example.invalid",
        resourceId: "24",
      })

    await doneHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        name: "Edited Raw Field DoneHub Channel",
        type: normalizedNative.type,
        key: "sk-********",
        base_url: "https://edited-upstream.example.invalid",
        models: ["gpt-4o-mini"],
        groups: ["vip"],
        priority: 21,
        weight: 34,
        status: 2,
      },
    )

    expect(doneHubApi.fetchChannelRaw).toHaveBeenCalledWith(
      {
        baseUrl: config.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: config.adminToken,
          userId: config.userId,
        },
      },
      24,
    )
    expect(doneHubApi.fetchChannel).not.toHaveBeenCalledWith(
      expect.anything(),
      24,
    )
    expect(doneHubApi.updateChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 24,
        name: "Edited Raw Field DoneHub Channel",
        proxy: "http://proxy.example.invalid:8080",
      }),
    )
    expect(doneHubApi.updateChannel.mock.calls.at(-1)?.[1]).not.toHaveProperty(
      "key",
    )
  })

  it("updates DoneHub resource drafts by preserving full native fields and omitting masked keys", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    doneHubApi.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const native = buildManagedSiteChannel({
      id: 21,
      key: "sk-********",
    }) as ManagedSiteChannel & Record<string, unknown>
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.DONE_HUB,
          scopeKey: "https://done-hub.example.invalid",
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

    await doneHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        name: "Edited DoneHub Channel",
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

    expect(doneHubApi.updateChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 21,
        name: "Edited DoneHub Channel",
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
    expect(doneHubApi.updateChannel.mock.calls.at(-1)?.[1]).not.toHaveProperty(
      "key",
    )
  })

  it("writes a DoneHub resource key only when the draft contains a usable user-supplied key", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    doneHubApi.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const native = buildManagedSiteChannel({
      id: 22,
      key: "sk-********",
    }) as ManagedSiteChannel & Record<string, unknown>
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.DONE_HUB,
          scopeKey: "https://done-hub.example.invalid",
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

    await doneHubManagedSiteCapabilities.resources.items.update(
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

    expect(doneHubApi.updateChannel.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        key: "sk-replacement-key",
      }),
    )
  })

  it("delegates DoneHub resource create and delete to existing channel operations", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    doneHubApi.createChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    doneHubApi.deleteChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const draft: ChannelFormData = {
      name: "Created DoneHub Channel",
      type: 1,
      key: "sk-created",
      base_url: "https://created.example.invalid",
      models: ["gpt-4o"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: CHANNEL_STATUS.Enable,
    }

    await doneHubManagedSiteCapabilities.resources.items.create(config, draft)
    await doneHubManagedSiteCapabilities.resources.items.delete(config, {
      managedSiteType: SITE_TYPES.DONE_HUB,
      scopeKey: "https://done-hub.example.invalid",
      resourceId: "25",
    })

    expect(doneHubApi.createChannel).toHaveBeenCalledWith(
      expect.anything(),
      buildChannelPayload(draft),
    )
    expect(doneHubApi.deleteChannel).toHaveBeenCalledWith(expect.anything(), 25)
  })
})
