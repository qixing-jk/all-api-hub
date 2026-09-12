import { describe, expect, it, vi } from "vitest"

import { newApiManagedResourceModels } from "~/services/apiAdapters/managedResources/newApiOperations"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import type { CreateChannelPayload } from "~/types/newApi"
import { CHANNEL_STATUS } from "~/types/newApi"
import {
  CHANNEL_MUTATION_SCENARIOS,
  testManagedSiteChannelMutationContract,
  type ChannelMutationScenario,
} from "~~/tests/services/apiAdapters/managedSites/channelMutationContract"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"

const channelManagement = vi.hoisted(() => ({
  manageChannelKey: vi.fn(),
  listAllChannels: vi.fn(),
  fetchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannelFields: vi.fn(),
  updateChannelStatus: vi.fn(),
  isNewApiManualStatus: vi.fn((status) => status === 1 || status === 2),
  deleteChannel: vi.fn(),
  fetchChannelModels: vi.fn(),
  fetchDraftChannelModels: vi.fn(),
  searchChannel: vi.fn(),
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
  prepareChannelFormData: vi.fn(),
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

  it.each([
    { case: "missing", modelFields: {} },
    { case: "null", modelFields: { models: null } },
  ])(
    "keeps the model inventory usable with $case channel models",
    async ({ modelFields }) => {
      const channel = {
        id: 7,
        name: "Unconfigured models",
        type: 1,
        status: 1,
        base_url: "https://upstream.example.invalid",
        key: "",
        model_mapping: "{}",
      }
      channelManagement.listAllChannels.mockResolvedValueOnce({
        items: [
          { ...channel, ...modelFields },
          { ...channel, id: 8, models: " model-a, , model-b " },
        ],
        total: 2,
        type_counts: { "1": 2 },
      })

      await expect(
        newApiManagedResourceModels.list(config, undefined),
      ).resolves.toMatchObject({
        total: 2,
        items: [
          {
            ref: modelResourceRef(7, { scopeKey: config.baseUrl }),
            models: [],
          },
          {
            ref: modelResourceRef(8, { scopeKey: config.baseUrl }),
            models: ["model-a", "model-b"],
          },
        ],
      })
    },
  )

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
        const { newApiChannelOperations } = await import(
          "~/services/apiAdapters/managedResources/newApiOperations"
        )
        return await newApiChannelOperations.create(config, createPayload)
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
        const { newApiChannelOperations } = await import(
          "~/services/apiAdapters/managedResources/newApiOperations"
        )
        return await newApiChannelOperations.update(config, updatePayload)
      },
      assertRequestPayload: () =>
        expect(
          channelManagement.updateChannelFields.mock.calls.at(-1)?.[1],
        ).toBe(updatePayload),
    },
    {
      name: "deleteKey",
      effect: {
        kind: "resource-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: null,
      arrange: arrangeRestMutation(channelManagement.manageChannelKey, null),
      invoke: async () => {
        const { newApiChannelOperations } = await import(
          "~/services/apiAdapters/managedResources/newApiOperations"
        )
        return await newApiChannelOperations.deleteKey(config, 7, 1)
      },
      assertRequestPayload: () =>
        expect(
          channelManagement.manageChannelKey.mock.calls.at(-1)?.slice(1),
        ).toEqual([7, "delete_key", 1]),
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
        const { newApiChannelOperations } = await import(
          "~/services/apiAdapters/managedResources/newApiOperations"
        )
        return await newApiChannelOperations.delete(config, 7)
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
          modelResourceRef(7, {
            siteType: "new-api",
            scopeKey: config.baseUrl,
          }),
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
          modelResourceRef(7, {
            siteType: "new-api",
            scopeKey: config.baseUrl,
          }),
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
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )

    await expect(
      newApiChannelOperations.create(config, createPayload),
    ).rejects.toBe(responseError)
  })

  it("uses fixed diagnostic copy when a New API rejection message is blank", async () => {
    const rejectionResponse = { success: false, data: null, message: "   " }
    channelManagement.createChannel.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      return rejectionResponse
    })
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )

    await expect(
      newApiChannelOperations.create(config, createPayload),
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
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )
    const payload = {
      mode: "single",
      channel: { name: "channel", status: 1 },
    } as CreateChannelPayload

    await expect(
      newApiChannelOperations.create(config, payload),
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

  it("retains confirmed key writes and stops when a later key operation fails", async () => {
    channelManagement.updateChannelFields.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return { success: true, data: null }
      },
    )
    channelManagement.manageChannelKey.mockImplementation(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      return { success: false, message: "key action rejected", data: null }
    })
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )
    const result = await newApiChannelOperations.update(
      config,
      { id: 7, key: "first\nsecond" },
      undefined,
      [
        { action: "delete_key", index: 0 },
        { action: "disable_key", index: 0 },
      ],
    )
    expect(result).toMatchObject({
      outcome: "partial",
      completion: "rejected",
      confirmedEffects: [expect.objectContaining({ kind: "resource-updated" })],
    })
    expect(channelManagement.manageChannelKey).toHaveBeenCalledTimes(1)
  })

  it.each(["deduplicated", "read-failed", "changed", "timeout"])(
    "keeps old keys when append is %s",
    async (scenario) => {
      channelManagement.manageChannelKey.mockClear()
      channelManagement.updateChannelFields.mockImplementation(
        async (request) => {
          request.observer?.onDispatch()
          if (scenario === "timeout") throw new TypeError("Failed to fetch")
          request.observer?.onResponse()
          return { success: true, data: null }
        },
      )
      channelManagement.fetchChannel.mockImplementation(async () => {
        if (scenario === "read-failed") throw new Error("read failed")
        return {
          channel_info: {
            is_multi_key: true,
            multi_key_size: scenario === "deduplicated" ? 2 : 3,
            multi_key_status_list: scenario === "changed" ? [2, 1, 1] : [1, 1],
          },
        }
      })
      const { newApiChannelOperations } = await import(
        "~/services/apiAdapters/managedResources/newApiOperations"
      )
      const result = await newApiChannelOperations.update(
        config,
        { id: 7, key: "replacement", key_mode: "append" },
        undefined,
        [{ action: "delete_key", index: 0 }],
        [1, 1, 1],
      )
      expect(result).toMatchObject({
        outcome: scenario === "timeout" ? "uncertain" : "partial",
      })
      expect(channelManagement.manageChannelKey).not.toHaveBeenCalled()
    },
  )

  it("confirms appended key state before deleting and stops after an unconfirmed indexed action", async () => {
    channelManagement.manageChannelKey.mockClear()
    channelManagement.updateChannelFields.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return { success: true, data: null }
      },
    )
    channelManagement.fetchChannel.mockResolvedValue({
      channel_info: {
        is_multi_key: true,
        multi_key_size: 3,
        multi_key_status_list: [1, 1, 1],
      },
    })
    channelManagement.manageChannelKey.mockImplementation(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      // Simulate an older server acknowledging but ignoring disable_key.
      return { success: true, data: null }
    })
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )
    const result = await newApiChannelOperations.update(
      config,
      { id: 7, key: "replacement", key_mode: "append" },
      undefined,
      [
        { action: "disable_key", index: 2 },
        { action: "delete_key", index: 0 },
      ],
      [1, 1, 1],
    )
    expect(result).toMatchObject({
      outcome: "partial",
      completion: "uncertain",
    })
    expect(channelManagement.manageChannelKey).toHaveBeenCalledTimes(1)
    expect(channelManagement.manageChannelKey.mock.calls[0][2]).toBe(
      "disable_key",
    )
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
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )

    await expect(
      newApiChannelOperations.update(config, {
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
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )

    await expect(
      newApiChannelOperations.update(config, {
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
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )

    await expect(
      newApiChannelOperations.update(config, {
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
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
    )

    await expect(
      newApiChannelOperations.update(config, {
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
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
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

    await newApiChannelOperations.search(config, "keyword")
    await newApiChannelOperations.list?.(config, {
      bypassSiteRequestLimit: true,
    })
    await newApiChannelOperations.get?.(config, 1)
    await newApiChannelOperations.create(config, createPayload)
    await newApiChannelOperations.update(config, {
      id: 1,
      name: "updated",
    })
    await newApiChannelOperations.delete(config, 1)
    await newApiManagedResourceModels.fetchModels?.(
      config,
      modelResourceRef(1, { siteType: "new-api", scopeKey: config.baseUrl }),
    )
    await newApiManagedResourceModels.fetchDraftModels?.(config, {
      channelType: 1,
      baseUrl: "https://upstream.example.invalid",
      credential: "credential-placeholder",
    })
    await newApiManagedResourceModels.updateModels?.(
      config,
      modelResourceRef(1, { siteType: "new-api", scopeKey: config.baseUrl }),
      ["gpt-4o"],
    )
    await newApiManagedResourceModels.updateModelMapping?.(
      config,
      modelResourceRef(1, { siteType: "new-api", scopeKey: config.baseUrl }),
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

    await newApiManagedResourceModels.fetchModels?.(
      config,
      modelResourceRef(1, { siteType: "new-api", scopeKey: config.baseUrl }),
      {
        signal,
        bypassSiteRequestLimit: true,
      },
    )

    expect(channelManagement.fetchChannelModels).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
      { signal, bypassSiteRequestLimit: true },
    )
  })

  it("propagates channel operation signals to the API transport request", async () => {
    const { newApiChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/newApiOperations"
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

    await newApiChannelOperations.search(config, "keyword", { signal })
    await newApiChannelOperations.get?.(config, 7, { signal })
    await newApiChannelOperations.create(config, createPayload, { signal })
    await newApiChannelOperations.update(config, updatePayload, { signal })
    await newApiChannelOperations.delete(config, 7, { signal })

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
      prepareFormData: newApiProvider.prepareChannelFormData,
    })
    expect(newApiManagedSiteCapabilities).not.toHaveProperty("imports")
  })
})
