import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidOctopusConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/octopus"
import type { ChannelFormData } from "~/types/managedSite"
import type { ManagedUpstreamResourceDetail } from "~/types/managedUpstreamResource"
import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
} from "~/types/octopus"

const octopusApi = vi.hoisted(() => ({
  listChannels: vi.fn(),
  searchChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchGroups: vi.fn(),
  fetchAvailableModels: vi.fn(),
}))

const userPreferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}))

vi.mock("~/services/apiService/octopus", () => ({
  ...octopusApi,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences,
}))

describe("Octopus managed-site channel capability", () => {
  const config = {
    baseUrl: "https://octopus.example.invalid",
    username: "admin",
    password: "password",
  }
  const octopusChannel: OctopusChannel = {
    id: 7,
    name: "Octopus channel",
    type: OctopusOutboundType.OpenAIChat,
    enabled: true,
    base_urls: [
      { url: "https://upstream.example.invalid/v1", delay: 120 },
      { url: "https://backup.example.invalid/v1", delay: 250 },
    ],
    keys: [
      {
        id: 1,
        channel_id: 7,
        enabled: true,
        channel_key: "sk-test",
        remark: "primary",
      },
    ],
    model: "gpt-4o",
    custom_model: "custom-a,custom-b",
    proxy: false,
    auto_sync: true,
    auto_group: OctopusAutoGroupType.Regex,
    custom_header: [{ header_key: "x-provider", header_value: "octopus" }],
    channel_proxy: "http://proxy.example.invalid:8080",
    param_override: '{"temperature":0.2}',
    match_regex: "^gpt-",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    userPreferences.getPreferences.mockResolvedValue({
      octopus: config,
    })
  })

  it("normalizes direct Octopus search and list results to managed-site channel list data", async () => {
    octopusApi.searchChannels.mockResolvedValue([octopusChannel])
    octopusApi.listChannels.mockResolvedValue([octopusChannel])

    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.search(config, "octopus"),
    ).resolves.toMatchObject({
      items: [
        {
          id: 7,
          name: "Octopus channel",
          base_url: "https://upstream.example.invalid/v1",
          key: "sk-test",
          models: "gpt-4o",
          _octopusData: octopusChannel,
        },
      ],
      total: 1,
      type_counts: {
        [String(OctopusOutboundType.OpenAIChat)]: 1,
      },
    })
    await expect(octopusManagedSiteChannels.list?.(config)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 7,
          _octopusData: octopusChannel,
        }),
      ],
      total: 1,
      type_counts: {
        [String(OctopusOutboundType.OpenAIChat)]: 1,
      },
    })
  })

  it("returns null when Octopus channel search fails", async () => {
    octopusApi.searchChannels.mockRejectedValue(new Error("search failed"))
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.search(config, "octopus"),
    ).resolves.toBeNull()
  })

  it("maps Octopus create payloads and preserves success messages", async () => {
    octopusApi.createChannel.mockResolvedValue({
      success: true,
      data: { id: 8 },
      message: "",
    })
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.create(config, {
        mode: "single",
        channel: {
          name: "",
          type: 1,
          status: 1,
        },
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: 8 },
      message: "success",
    })

    expect(octopusApi.createChannel).toHaveBeenCalledWith(config, {
      name: "",
      type: OctopusOutboundType.OpenAIResponse,
      enabled: true,
      base_urls: [{ url: "" }],
      keys: [{ enabled: true, channel_key: "" }],
      model: undefined,
      auto_sync: true,
      auto_group: 0,
    })
  })

  it("returns safe ApiResponse fallbacks for Octopus create failures", async () => {
    octopusApi.createChannel.mockRejectedValue(new Error("create failed"))
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.create(config, {
        mode: "single",
        channel: { name: "broken", status: 1 },
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "create failed",
    })
  })

  it("exposes provider config and draft functions", async () => {
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    expect(octopusManagedSiteCapabilities.config.checkValid).toBe(
      checkValidOctopusConfig,
    )
    await expect(octopusManagedSiteCapabilities.config.get()).resolves.toEqual(
      config,
    )
    expect(octopusManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels,
      buildName: buildChannelName,
      prepareFormData: prepareChannelFormData,
      buildPayload: buildChannelPayload,
    })
    expect(octopusManagedSiteCapabilities.resources).toEqual({
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
    })
    expect(octopusManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("preserves an explicit empty base URL update", async () => {
    octopusApi.updateChannel.mockResolvedValue({
      success: true,
      data: null,
    })
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await octopusManagedSiteChannels.update(config, {
      id: 7,
      base_url: "",
    })

    expect(octopusApi.updateChannel).toHaveBeenCalledWith(config, {
      id: 7,
      name: undefined,
      type: undefined,
      enabled: undefined,
      base_urls: [{ url: "" }],
      model: undefined,
    })
  })

  it("maps Octopus update fields and returns safe failure responses", async () => {
    octopusApi.updateChannel.mockResolvedValueOnce({
      success: true,
      data: { id: 7 },
      message: "",
    })
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.update(config, {
        id: 7,
        name: "Updated",
        type: 1,
        status: 0,
        models: "gpt-4o",
      } as Parameters<typeof octopusManagedSiteChannels.update>[1]),
    ).resolves.toEqual({
      success: true,
      data: { id: 7 },
      message: "success",
    })

    expect(octopusApi.updateChannel).toHaveBeenLastCalledWith(config, {
      id: 7,
      name: "Updated",
      type: OctopusOutboundType.OpenAIResponse,
      enabled: false,
      base_urls: undefined,
      model: "gpt-4o",
    })

    octopusApi.updateChannel.mockRejectedValueOnce(new Error("update failed"))
    await expect(
      octopusManagedSiteChannels.update(config, { id: 7 }),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "update failed",
    })
  })

  it("maps Octopus delete responses and failures", async () => {
    octopusApi.deleteChannel.mockResolvedValueOnce({
      success: true,
      data: null,
      message: "",
    })
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(octopusManagedSiteChannels.delete(config, 7)).resolves.toEqual(
      {
        success: true,
        data: null,
        message: "success",
      },
    )
    expect(octopusApi.deleteChannel).toHaveBeenCalledWith(config, 7)

    octopusApi.deleteChannel.mockRejectedValueOnce(new Error("delete failed"))
    await expect(octopusManagedSiteChannels.delete(config, 7)).resolves.toEqual(
      {
        success: false,
        data: null,
        message: "delete failed",
      },
    )
  })

  it("maps native Octopus channels to core resource summaries", async () => {
    octopusApi.listChannels.mockResolvedValue([octopusChannel])
    octopusApi.searchChannels.mockResolvedValue([
      {
        ...octopusChannel,
        id: 8,
        name: "Disabled Octopus channel",
        enabled: false,
        keys: [{ enabled: true, channel_key: "sk-********" }],
      },
    ])
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteCapabilities.resources.items.list(config),
    ).resolves.toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Octopus channel",
          nativeKind: "outbound",
          status: "enabled",
          typeLabel: "OpenAI Chat",
          endpointLabel: "https://upstream.example.invalid/v1",
          modelCount: 1,
          modelPreview: ["gpt-4o"],
          secretState: "available",
          ref: {
            managedSiteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.invalid",
            resourceId: "7",
          },
        }),
      ],
    })

    await expect(
      octopusManagedSiteCapabilities.resources.items.search(config, "octopus"),
    ).resolves.toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Disabled Octopus channel",
          nativeKind: "outbound",
          status: "disabled",
          secretState: "masked",
          ref: {
            managedSiteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.invalid",
            resourceId: "8",
          },
        }),
      ],
    })
  })

  it("delegates Octopus resource create and delete through existing channel operations with normalized responses", async () => {
    octopusApi.createChannel.mockResolvedValue({
      success: true,
      data: {
        ...octopusChannel,
        id: 9,
        name: "Created Octopus channel",
      },
      message: "",
    })
    octopusApi.deleteChannel.mockResolvedValue({
      success: true,
      data: undefined,
      message: "",
    })
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteCapabilities.resources.items.create(config, {
        name: "Created Octopus channel",
        type: OctopusOutboundType.Gemini,
        key: "sk-created",
        base_url: "https://created.example.invalid/v1",
        models: ["gemini-1.5-pro"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }),
    ).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        displayName: "Created Octopus channel",
        nativeKind: "outbound",
        status: "enabled",
        ref: {
          managedSiteType: SITE_TYPES.OCTOPUS,
          scopeKey: "https://octopus.example.invalid",
          resourceId: "9",
        },
      }),
      message: "success",
    })
    await expect(
      octopusManagedSiteCapabilities.resources.items.delete(config, {
        managedSiteType: SITE_TYPES.OCTOPUS,
        scopeKey: "https://octopus.example.invalid",
        resourceId: "9",
      }),
    ).resolves.toEqual({
      success: true,
      data: null,
      message: "success",
    })

    expect(octopusApi.createChannel).toHaveBeenCalledWith(config, {
      name: "Created Octopus channel",
      type: OctopusOutboundType.Gemini,
      enabled: true,
      base_urls: [{ url: "https://created.example.invalid/v1" }],
      keys: [{ enabled: true, channel_key: "sk-created" }],
      model: "gemini-1.5-pro",
      auto_sync: true,
      auto_group: 0,
    })
    expect(octopusApi.deleteChannel).toHaveBeenCalledWith(config, 9)
  })

  it("loads Octopus detail from native channel data and prepares channel-worded edit drafts", async () => {
    octopusApi.listChannels.mockResolvedValue([octopusChannel])
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    const detail =
      await octopusManagedSiteCapabilities.resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.OCTOPUS,
        scopeKey: "https://octopus.example.invalid",
        resourceId: "7",
      })
    const draft =
      octopusManagedSiteCapabilities.resources.drafts.prepareEditDraft(detail)

    expect(detail).toEqual({
      summary: expect.objectContaining({
        displayName: "Octopus channel",
        nativeKind: "outbound",
      }),
      native: octopusChannel,
    })
    expect(
      octopusManagedSiteCapabilities.resources.drafts.describeFields({
        mode: "edit",
        detail,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "name", label: "Channel name" }),
        expect.objectContaining({ name: "key", label: "API key" }),
      ]),
    )
    expect(draft).toEqual({
      name: "Octopus channel",
      type: OctopusOutboundType.OpenAIChat,
      key: "sk-test",
      base_url: "https://upstream.example.invalid/v1",
      models: ["gpt-4o"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 1,
    })
  })

  it("rejects stale Octopus resource refs from a different site or scope before native access", async () => {
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteCapabilities.resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.NEW_API,
        scopeKey: "https://octopus.example.invalid",
        resourceId: "7",
      }),
    ).rejects.toThrow("Resource reference does not match this managed site")
    await expect(
      octopusManagedSiteCapabilities.resources.items.delete(config, {
        managedSiteType: SITE_TYPES.OCTOPUS,
        scopeKey: "https://other.example.invalid",
        resourceId: "7",
      }),
    ).rejects.toThrow("Resource reference does not match this managed site")

    expect(octopusApi.listChannels).not.toHaveBeenCalled()
    expect(octopusApi.deleteChannel).not.toHaveBeenCalled()
  })

  it("preserves native Octopus fields through resource edit updates while omitting masked keys", async () => {
    octopusApi.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )
    const detail: ManagedUpstreamResourceDetail<OctopusChannel> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.OCTOPUS,
          scopeKey: "https://octopus.example.invalid",
          resourceId: "7",
        },
        displayName: octopusChannel.name,
        nativeKind: "outbound",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: {
        ...octopusChannel,
        keys: [
          {
            id: 1,
            channel_id: 7,
            enabled: true,
            channel_key: "sk-********",
            remark: "primary",
          },
        ],
      },
    }

    await octopusManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        name: "Edited Octopus channel",
        type: OctopusOutboundType.Anthropic,
        key: "sk-********",
        base_url: "https://edited.example.invalid/v1",
        models: ["claude-3-5-sonnet"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 2,
      },
    )

    expect(octopusApi.updateChannel).toHaveBeenCalledWith(config, {
      id: 7,
      name: "Edited Octopus channel",
      type: OctopusOutboundType.Anthropic,
      enabled: false,
      base_urls: [
        { url: "https://edited.example.invalid/v1", delay: 120 },
        { url: "https://backup.example.invalid/v1", delay: 250 },
      ],
      model: "claude-3-5-sonnet",
      custom_model: "custom-a,custom-b",
      proxy: false,
      auto_sync: true,
      auto_group: OctopusAutoGroupType.Regex,
      custom_header: [{ header_key: "x-provider", header_value: "octopus" }],
      channel_proxy: "http://proxy.example.invalid:8080",
      param_override: '{"temperature":0.2}',
      match_regex: "^gpt-",
    })
    expect(octopusApi.updateChannel.mock.calls.at(-1)?.[1]).not.toHaveProperty(
      "keys_to_update",
    )
    expect(octopusApi.updateChannel.mock.calls.at(-1)?.[1]).not.toHaveProperty(
      "keys_to_add",
    )
  })

  it("updates an Octopus key only when the draft contains a usable replacement key", async () => {
    octopusApi.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await octopusManagedSiteCapabilities.resources.items.update(
      config,
      {
        summary: {
          ref: {
            managedSiteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.invalid",
            resourceId: "7",
          },
          displayName: octopusChannel.name,
          nativeKind: "outbound",
          status: "enabled",
          secretState: "available",
          capabilities: { canUpdate: true },
        },
        native: octopusChannel,
      },
      {
        name: octopusChannel.name,
        type: octopusChannel.type,
        key: "  sk-replacement-key  ",
        base_url: octopusChannel.base_urls[0].url,
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    )

    expect(octopusApi.updateChannel.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        keys_to_update: [
          {
            id: 1,
            enabled: true,
            channel_key: "sk-replacement-key",
            remark: "primary",
          },
        ],
      }),
    )
  })

  it("adds an Octopus key only for usable drafts when no primary key exists", async () => {
    octopusApi.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )
    const detail: ManagedUpstreamResourceDetail<OctopusChannel> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.OCTOPUS,
          scopeKey: "https://octopus.example.invalid",
          resourceId: "7",
        },
        displayName: octopusChannel.name,
        nativeKind: "outbound",
        status: "enabled",
        secretState: "unavailable",
        capabilities: { canUpdate: true },
      },
      native: {
        ...octopusChannel,
        keys: [],
      },
    }
    const draft: ChannelFormData = {
      name: octopusChannel.name,
      type: octopusChannel.type,
      key: "  sk-added-key  ",
      base_url: octopusChannel.base_urls[0].url,
      models: ["gpt-4o"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 1,
    }

    await octopusManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      draft,
    )

    expect(octopusApi.updateChannel.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        keys_to_add: [
          expect.objectContaining({
            enabled: true,
            channel_key: "sk-added-key",
          }),
        ],
      }),
    )

    octopusApi.updateChannel.mockClear()
    await octopusManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        ...draft,
        key: "",
      },
    )

    expect(octopusApi.updateChannel.mock.calls.at(-1)?.[1]).not.toHaveProperty(
      "keys_to_add",
    )
    expect(octopusApi.updateChannel.mock.calls.at(-1)?.[1]).not.toHaveProperty(
      "keys_to_update",
    )
  })
})
