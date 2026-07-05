import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"
import type {
  CreateChannelPayload,
  ManagedSiteChannel,
} from "~/types/managedSite"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const channelManagement = vi.hoisted(() => ({
  searchChannel: vi.fn(),
  listAllChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
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
  fetchSiteUserGroups: vi.fn(),
  fetchAccountAvailableModels: vi.fn(),
}))

const newApiProvider = vi.hoisted(() => ({
  checkValidNewApiConfig: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
}))

const userPreferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/channelManagement", () => ({
  ...channelManagement,
}))

vi.mock("~/services/apiService/newApiFamily/default/keyManagement", () => ({
  ...keyManagement,
}))

vi.mock("~/services/managedSites/providers/newApi", () => ({
  ...newApiProvider,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences,
}))

describe("newApi managed-site channel capability", () => {
  const config = {
    baseUrl: "https://new-api.example.invalid",
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

  it("delegates channel operations to direct New API family helpers", async () => {
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }
    const createPayload = {
      mode: "single",
      channel: {
        name: "channel",
        status: 1,
      },
    } as CreateChannelPayload

    await newApiManagedSiteChannels.search(config, "keyword")
    await newApiManagedSiteChannels.list?.(config, {
      bypassSiteRequestLimit: true,
    })
    await newApiManagedSiteChannels.create(config, createPayload)
    await newApiManagedSiteChannels.update(config, {
      id: 1,
      name: "updated",
    })
    await newApiManagedSiteChannels.delete(config, 1)
    await newApiManagedSiteChannels.fetchModels?.(config, 1)
    await newApiManagedSiteChannels.updateModels?.(config, 1, ["gpt-4o"])
    await newApiManagedSiteChannels.updateModelMapping?.(
      config,
      1,
      ["gpt-4o"],
      { "gpt-4o": "upstream-gpt-4o" },
    )

    expect(channelManagement.searchChannel).toHaveBeenCalledWith(
      request,
      "keyword",
    )
    expect(channelManagement.listAllChannels).toHaveBeenCalledWith(
      { ...request, bypassSiteRequestLimit: true },
      { bypassSiteRequestLimit: true },
    )
    expect(channelManagement.createChannel).toHaveBeenCalledWith(
      request,
      createPayload,
    )
    expect(channelManagement.updateChannel).toHaveBeenCalledWith(request, {
      id: 1,
      name: "updated",
    })
    expect(channelManagement.deleteChannel).toHaveBeenCalledWith(request, 1)
    expect(channelManagement.fetchChannelModels).toHaveBeenCalledWith(
      request,
      1,
      undefined,
    )
    expect(channelManagement.updateChannelModels).toHaveBeenCalledWith(
      request,
      1,
      "gpt-4o",
      undefined,
    )
    expect(channelManagement.updateChannelModelMapping).toHaveBeenCalledWith(
      request,
      1,
      "gpt-4o",
      JSON.stringify({ "gpt-4o": "upstream-gpt-4o" }),
      undefined,
    )
  })

  it("delegates managed-site query helpers to direct New API family helpers", async () => {
    const { newApiManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    await newApiManagedSiteCapabilities.queries.fetchSiteUserGroups(config)
    await newApiManagedSiteCapabilities.queries.fetchAccountAvailableModels(
      config,
    )

    expect(keyManagement.fetchSiteUserGroups).toHaveBeenCalledWith(request)
    expect(keyManagement.fetchAccountAvailableModels).toHaveBeenCalledWith(
      request,
    )
  })

  it("propagates model-sync request options to direct New API helpers", async () => {
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    const signal = new AbortController().signal
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
      bypassSiteRequestLimit: true,
    }

    await newApiManagedSiteChannels.fetchModels?.(config, 1, {
      signal,
      bypassSiteRequestLimit: true,
    })

    expect(channelManagement.fetchChannelModels).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
      { signal, bypassSiteRequestLimit: true },
    )
  })

  it("loads config through the managed-site runtime config boundary", async () => {
    userPreferences.getPreferences.mockResolvedValue({
      newApi: config,
    })

    const { newApiManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )

    await expect(newApiManagedSiteCapabilities.config.get()).resolves.toBe(
      config,
    )
  })

  it("exposes provider config and draft functions", async () => {
    const { newApiManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )

    expect(newApiManagedSiteCapabilities.config.checkValid).toBe(
      newApiProvider.checkValidNewApiConfig,
    )
    expect(newApiManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: expect.any(Function),
      buildName: newApiProvider.buildChannelName,
      prepareFormData: newApiProvider.prepareChannelFormData,
      buildPayload: newApiProvider.buildChannelPayload,
    })
    expect(newApiManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("injects account model fallback into the provider draft capability", async () => {
    const { newApiManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    const account = buildDisplaySiteData({
      id: "1",
      siteType: "new-api",
      baseUrl: config.baseUrl,
    })
    const token = buildApiToken({
      id: 10,
      name: "token",
      key: "token-key",
    })

    await newApiManagedSiteCapabilities.channelDrafts.fetchAvailableModels(
      account,
      token,
    )

    expect(newApiProvider.fetchAvailableModels).toHaveBeenCalledWith(
      account,
      token,
      {
        fetchAccountAvailableModels: keyManagement.fetchAccountAvailableModels,
      },
    )
  })

  it("maps channels to core resource summaries and resolves detail through list fallback", async () => {
    const { newApiManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    const channel = buildManagedSiteChannel({
      id: 12,
      key: "sk-********",
      name: "Masked Channel",
      status: 3,
    })
    channelManagement.listAllChannels.mockResolvedValue({
      items: [channel],
      total: 1,
      type_counts: {},
    })

    const list =
      await newApiManagedSiteCapabilities.resources.items.list(config)

    expect(list.total).toBe(1)
    expect(list.items[0]).toEqual(
      expect.objectContaining({
        displayName: "Masked Channel",
        nativeKind: "channel",
        status: "auto_disabled",
        endpointLabel: "https://upstream.example.invalid",
        modelCount: 2,
        secretState: "masked",
        ref: {
          managedSiteType: "new-api",
          scopeKey: "https://new-api.example.invalid",
          resourceId: "12",
        },
      }),
    )

    await expect(
      newApiManagedSiteCapabilities.resources.items.getDetail(
        config,
        list.items[0].ref,
      ),
    ).resolves.toEqual({
      summary: list.items[0],
      native: channel,
    })
  })

  it("updates resource drafts by preserving native fields and omitting masked keys", async () => {
    const { newApiManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    channelManagement.updateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    const native = buildManagedSiteChannel({
      id: 19,
      key: "sk-********",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://new-api.example.invalid",
          resourceId: "19",
        },
        displayName: native.name,
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native,
    } as const

    await newApiManagedSiteCapabilities.resources.items.update(config, detail, {
      name: "Edited Channel",
      type: native.type,
      key: "sk-********",
      base_url: "https://edited-upstream.example.invalid",
      models: ["gpt-4o-mini"],
      groups: ["vip"],
      priority: 21,
      weight: 34,
      status: 2,
    })

    expect(channelManagement.updateChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 19,
        name: "Edited Channel",
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
      }),
    )
    expect(
      channelManagement.updateChannel.mock.calls.at(-1)?.[1],
    ).not.toHaveProperty("key")
  })

  it("delegates resource create and delete to channel operations", async () => {
    const { newApiManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    channelManagement.createChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    channelManagement.deleteChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    newApiProvider.buildChannelPayload.mockReturnValue({
      mode: "single",
      channel: {
        name: "Created",
        key: "sk-created",
        status: 1,
      },
    })

    await newApiManagedSiteCapabilities.resources.items.create(config, {
      name: "Created",
      type: 1,
      key: "sk-created",
      base_url: "https://created.example.invalid",
      models: ["gpt-4o"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 1,
    })
    await newApiManagedSiteCapabilities.resources.items.delete(config, {
      managedSiteType: SITE_TYPES.NEW_API,
      scopeKey: "https://new-api.example.invalid",
      resourceId: "25",
    })

    expect(channelManagement.createChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: "single" }),
    )
    expect(channelManagement.deleteChannel).toHaveBeenCalledWith(
      expect.anything(),
      25,
    )
  })
})
