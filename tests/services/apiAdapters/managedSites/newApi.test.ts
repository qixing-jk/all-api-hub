import { describe, expect, it, vi } from "vitest"

import { AuthTypeEnum } from "~/types"
import type { CreateChannelPayload } from "~/types/managedSite"

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
      request,
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
      fetchAvailableModels: newApiProvider.fetchAvailableModels,
      buildName: newApiProvider.buildChannelName,
      prepareFormData: newApiProvider.prepareChannelFormData,
      buildPayload: newApiProvider.buildChannelPayload,
    })
    expect(newApiManagedSiteCapabilities).not.toHaveProperty("imports")
  })
})
