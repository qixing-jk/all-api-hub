import { describe, expect, it, vi } from "vitest"

import { newApiManagedResourceModels } from "~/services/apiAdapters/managedSites/newApi"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import type { CreateChannelPayload } from "~/types/managedSite"
import { CHANNEL_STATUS } from "~/types/managedSite"
import {
  CHANNEL_MUTATION_SCENARIOS,
  testManagedSiteChannelMutationContract,
  type ChannelMutationScenario,
} from "~~/tests/services/apiAdapters/managedSites/channelMutationContract"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const channelManagement = vi.hoisted(() => ({
  searchChannel: vi.fn(),
  listAllChannels: vi.fn(),
  fetchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  updateChannelFields: vi.fn(),
  updateChannelStatus: vi.fn(),
  isNewApiManualStatus: vi.fn((status) => status === 1 || status === 2),
  deleteChannel: vi.fn(),
  fetchChannelModels: vi.fn(),
  fetchDraftChannelModels: vi.fn(),
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
  fetchAccountTokens: vi.fn(),
  fetchCurrentUserGroup: vi.fn(),
  createApiToken: vi.fn(),
  updateApiToken: vi.fn(),
  deleteApiToken: vi.fn(),
  fetchUserGroups: vi.fn(),
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

  const createPayload = {
    mode: "single",
    channel: { name: "channel", status: 1 },
  } as CreateChannelPayload
  const updatePayload = { id: 7, name: "updated" }
  const models = ["model-a", "model-b"]
  const modelMapping = { "model-a": "upstream-model-a" }

  const arrangeRestMutation =
    (mock: typeof channelManagement.createChannel, successData: unknown) =>
    (scenario: ChannelMutationScenario) => {
      const raw =
        scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation
          ? new DOMException("cancelled", "AbortError")
          : new TypeError("Failed to fetch")
      const rejectionResponse = {
        success: false,
        data: null,
        message: "provider rejected",
      }
      mock.mockImplementation(async (request) => {
        if (scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation) {
          throw raw
        }
        request.observer?.onDispatch()
        if (scenario === CHANNEL_MUTATION_SCENARIOS.PostDispatchAmbiguity) {
          throw raw
        }
        request.observer?.onResponse()
        return scenario === CHANNEL_MUTATION_SCENARIOS.Rejected
          ? rejectionResponse
          : { success: true, data: successData, message: "success" }
      })
      return { raw, rejectionResponse }
    }

  testManagedSiteChannelMutationContract([
    {
      name: "create",
      effect: {
        kind: "resource-created",
        resourceKind: "channel",
      },
      successData: { id: 17 },
      arrange: arrangeRestMutation(channelManagement.createChannel, { id: 17 }),
      invoke: async () => {
        const { newApiManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/newApi"
        )
        return await newApiManagedSiteChannels.create(config, createPayload)
      },
      assertRequestPayload: () =>
        expect(channelManagement.createChannel.mock.calls.at(-1)?.[1]).toBe(
          createPayload,
        ),
    },
    {
      name: "update",
      effect: {
        kind: "resource-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: { id: 7 },
      arrange: arrangeRestMutation(channelManagement.updateChannelFields, {
        id: 7,
      }),
      invoke: async () => {
        const { newApiManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/newApi"
        )
        return await newApiManagedSiteChannels.update(config, updatePayload)
      },
      assertRequestPayload: () =>
        expect(
          channelManagement.updateChannelFields.mock.calls.at(-1)?.[1],
        ).toBe(updatePayload),
    },
    {
      name: "delete",
      effect: {
        kind: "resource-deleted",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(channelManagement.deleteChannel, null),
      invoke: async () => {
        const { newApiManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/newApi"
        )
        return await newApiManagedSiteChannels.delete(config, 7)
      },
      assertRequestPayload: () =>
        expect(channelManagement.deleteChannel.mock.calls.at(-1)?.[1]).toBe(7),
    },
    {
      name: "updateModels",
      effect: {
        kind: "models-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(channelManagement.updateChannelFields, null),
      invoke: async () => {
        return await newApiManagedResourceModels.updateModels!(
          config,
          7,
          models,
        )
      },
      assertRequestPayload: () =>
        expect(
          channelManagement.updateChannelFields.mock.calls.at(-1)?.[1],
        ).toEqual({ id: 7, models: "model-a,model-b" }),
    },
    {
      name: "updateModelMapping",
      effect: {
        kind: "model-mapping-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(channelManagement.updateChannelFields, null),
      invoke: async () => {
        return await newApiManagedResourceModels.updateModelMapping!(
          config,
          7,
          models,
          modelMapping,
        )
      },
      assertRequestPayload: () =>
        expect(
          channelManagement.updateChannelFields.mock.calls.at(-1)?.[1],
        ).toEqual({
          id: 7,
          models: "model-a,model-b",
          model_mapping: JSON.stringify(modelMapping),
        }),
    },
  ])

  it("preserves response-received New API error identity", async () => {
    const responseError = new Error("malformed provider response")
    channelManagement.createChannel.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      throw responseError
    })
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )

    await expect(
      newApiManagedSiteChannels.create(config, createPayload),
    ).rejects.toBe(responseError)
  })

  it("uses fixed diagnostic copy when a New API rejection message is blank", async () => {
    const rejectionResponse = { success: false, data: null, message: "   " }
    channelManagement.createChannel.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      return rejectionResponse
    })
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )

    await expect(
      newApiManagedSiteChannels.create(config, createPayload),
    ).resolves.toEqual({
      outcome: "rejected",
      diagnostic: {
        message: "Provider rejected the mutation",
        raw: rejectionResponse,
      },
    })
  })

  it("returns the common mutation result for a confirmed create", async () => {
    channelManagement.createChannel.mockImplementation(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      return { success: true, data: { id: 17 }, message: "created" }
    })
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    const payload = {
      mode: "single",
      channel: { name: "channel", status: 1 },
    } as CreateChannelPayload

    await expect(
      newApiManagedSiteChannels.create(config, payload),
    ).resolves.toEqual({
      outcome: "succeeded",
      data: { id: 17 },
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: "channel",
        },
      ],
    })
    expect(channelManagement.createChannel.mock.calls.at(-1)?.[1]).toBe(payload)
  })

  it("returns partial/rejected when fields apply and the status response rejects", async () => {
    const statusResponse = {
      success: false,
      data: null,
      message: "provider rejected",
    }
    channelManagement.updateChannelFields.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return { success: true, data: { id: 7 }, message: "success" }
      },
    )
    channelManagement.updateChannelStatus.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return statusResponse
      },
    )
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )

    await expect(
      newApiManagedSiteChannels.update(config, {
        id: 7,
        name: "updated",
        status: CHANNEL_STATUS.Enable,
      }),
    ).resolves.toEqual({
      outcome: "partial",
      confirmedEffects: [
        {
          kind: "resource-updated",
          resourceKind: "channel",
          resourceId: 7,
        },
      ],
      completion: "rejected",
      diagnostic: { message: "provider rejected", raw: statusResponse },
    })
  })

  it("returns partial/uncertain when fields apply and the status response is lost", async () => {
    const raw = new TypeError("Failed to fetch")
    channelManagement.updateChannelFields.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return { success: true, data: { id: 7 }, message: "success" }
      },
    )
    channelManagement.updateChannelStatus.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        throw raw
      },
    )
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )

    await expect(
      newApiManagedSiteChannels.update(config, {
        id: 7,
        status: CHANNEL_STATUS.Enable,
      }),
    ).resolves.toEqual({
      outcome: "partial",
      confirmedEffects: [
        {
          kind: "resource-updated",
          resourceKind: "channel",
          resourceId: 7,
        },
      ],
      completion: "uncertain",
      diagnostic: { message: "Failed to fetch", raw },
    })
  })

  it("returns rejected when the field update rejects before status dispatch", async () => {
    const fieldResponse = {
      success: false,
      data: null,
      message: "provider rejected",
    }
    channelManagement.updateChannelFields.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return fieldResponse
      },
    )
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )

    await expect(
      newApiManagedSiteChannels.update(config, {
        id: 7,
        status: CHANNEL_STATUS.Enable,
      }),
    ).resolves.toEqual({
      outcome: "rejected",
      diagnostic: { message: "provider rejected", raw: fieldResponse },
    })
    expect(channelManagement.updateChannelStatus).not.toHaveBeenCalled()
  })

  it("returns both confirmed effects when fields and status apply", async () => {
    channelManagement.updateChannelFields.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return { success: true, data: { id: 7 }, message: "success" }
      },
    )
    channelManagement.updateChannelStatus.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return { success: true, data: true, message: "success" }
      },
    )
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )

    await expect(
      newApiManagedSiteChannels.update(config, {
        id: 7,
        status: CHANNEL_STATUS.Enable,
      }),
    ).resolves.toEqual({
      outcome: "succeeded",
      data: { id: 7 },
      confirmedEffects: [
        {
          kind: "resource-updated",
          resourceKind: "channel",
          resourceId: 7,
        },
        {
          kind: "status-updated",
          resourceKind: "channel",
          resourceId: 7,
        },
      ],
    })
  })

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
    await newApiManagedSiteChannels.get?.(config, 1)
    await newApiManagedSiteChannels.create(config, createPayload)
    await newApiManagedSiteChannels.update(config, {
      id: 1,
      name: "updated",
    })
    await newApiManagedSiteChannels.delete(config, 1)
    await newApiManagedResourceModels.fetchModels?.(config, 1)
    await newApiManagedResourceModels.fetchDraftModels?.(config, {
      channelType: 1,
      baseUrl: "https://upstream.example.invalid",
      credential: "credential-placeholder",
    })
    await newApiManagedResourceModels.updateModels?.(config, 1, ["gpt-4o"])
    await newApiManagedResourceModels.updateModelMapping?.(
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
    expect(channelManagement.fetchChannel).toHaveBeenCalledWith(
      request,
      1,
      undefined,
    )
    expect(channelManagement.createChannel).toHaveBeenCalledWith(
      expect.objectContaining(request),
      createPayload,
    )
    expect(channelManagement.updateChannelFields).toHaveBeenCalledWith(
      expect.objectContaining(request),
      expect.objectContaining({ id: 1, name: "updated" }),
    )
    expect(channelManagement.deleteChannel).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
    )
    expect(channelManagement.fetchChannelModels).toHaveBeenCalledWith(
      request,
      1,
      undefined,
    )
    expect(channelManagement.fetchDraftChannelModels).toHaveBeenCalledWith(
      request,
      {
        type: 1,
        baseUrl: "https://upstream.example.invalid",
        key: "credential-placeholder",
      },
      undefined,
    )
    expect(channelManagement.updateChannelFields).toHaveBeenCalledWith(
      expect.objectContaining(request),
      { id: 1, models: "gpt-4o" },
      undefined,
    )
    expect(channelManagement.updateChannelFields).toHaveBeenCalledWith(
      expect.objectContaining(request),
      {
        id: 1,
        models: "gpt-4o",
        model_mapping: JSON.stringify({ "gpt-4o": "upstream-gpt-4o" }),
      },
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
    const signal = new AbortController().signal

    await newApiManagedSiteCapabilities.queries.siteUserGroups!.fetch(config, {
      signal,
    })
    await newApiManagedSiteCapabilities.queries.accountAvailableModels!.fetch(
      config,
    )

    expect(keyManagement.fetchSiteUserGroups).toHaveBeenCalledWith({
      ...request,
      abortSignal: signal,
    })
    expect(keyManagement.fetchAccountAvailableModels).toHaveBeenCalledWith(
      request,
    )
  })

  it("propagates model-sync request options to direct New API helpers", async () => {
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

    await newApiManagedResourceModels.fetchModels?.(config, 1, {
      signal,
      bypassSiteRequestLimit: true,
    })

    expect(channelManagement.fetchChannelModels).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
      { signal, bypassSiteRequestLimit: true },
    )
  })

  it("propagates channel operation signals to the API transport request", async () => {
    const { newApiManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/newApi"
    )
    const signal = new AbortController().signal

    channelManagement.searchChannel.mockResolvedValue({ items: [], total: 0 })
    const succeedMutation =
      (message: string) => async (request: ApiServiceRequest) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return { success: true, data: undefined, message }
      }
    channelManagement.createChannel.mockImplementation(
      succeedMutation("created"),
    )
    channelManagement.updateChannelFields.mockImplementation(
      succeedMutation("updated"),
    )
    channelManagement.deleteChannel.mockImplementation(
      succeedMutation("deleted"),
    )

    await newApiManagedSiteChannels.search(config, "keyword", { signal })
    await newApiManagedSiteChannels.get?.(config, 7, { signal })
    await newApiManagedSiteChannels.create(config, createPayload, { signal })
    await newApiManagedSiteChannels.update(config, updatePayload, { signal })
    await newApiManagedSiteChannels.delete(config, 7, { signal })

    for (const mock of [
      channelManagement.searchChannel,
      channelManagement.fetchChannel,
      channelManagement.createChannel,
      channelManagement.updateChannelFields,
      channelManagement.deleteChannel,
    ]) {
      expect(mock.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ abortSignal: signal }),
      )
    }
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
})
