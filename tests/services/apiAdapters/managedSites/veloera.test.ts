import { describe, expect, it, vi } from "vitest"

import {
  buildChannelName,
  buildChannelPayload,
  checkValidVeloeraConfig,
  prepareChannelFormData,
} from "~/services/managedSites/providers/veloera"
import { AuthTypeEnum } from "~/types"
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
    await veloeraManagedSiteChannels.fetchModels?.(config, 1, {
      signal: new AbortController().signal,
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
    expect(veloeraApi.fetchChannelModels).toHaveBeenCalledWith(request, 1, {
      signal: expect.any(AbortSignal),
    })
    expect(veloeraApi.updateChannelModels).toHaveBeenCalledWith(
      request,
      1,
      "gpt-4o,claude-3",
      { signal: expect.any(AbortSignal) },
    )
    expect(veloeraApi.updateChannelModelMapping).toHaveBeenCalledWith(
      request,
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
})
