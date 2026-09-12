import { beforeEach, describe, expect, it, vi } from "vitest"

import { veloeraManagedResourceModels } from "~/services/apiAdapters/managedResources/veloeraOperations"
import { veloeraManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/veloera"
import { ApiError } from "~/services/apiTransport/errors"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import type { NewApiChannel } from "~/types/newApi"
import {
  CHANNEL_MUTATION_SCENARIOS,
  testManagedSiteChannelMutationContract,
  type ChannelMutationScenario,
} from "~~/tests/services/apiAdapters/managedSites/channelMutationContract"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"
import { buildManagedResourceMatchCandidate } from "~~/tests/test-utils/managedResourceMatching"

const veloeraApi = vi.hoisted(() => ({
  listAllChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchChannel: vi.fn(),
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
  fetchAccountAvailableModels: vi.fn(),
  fetchSiteUserGroups: vi.fn(),
}))

vi.mock("~/services/apiService/veloera", () => ({
  ...veloeraApi,
}))

vi.mock("~/services/apiService/newApiFamily/default/keyManagement", () => ({
  ...keyManagement,
}))

describe("Veloera managed-site channel capability", () => {
  const config = {
    baseUrl: "https://veloera.example.invalid",
    adminToken: "admin-token",
    userId: "42",
  }

  it("forwards cancellation for direct and masked matching key reads", async () => {
    const signal = new AbortController().signal
    const options = {
      signal,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
      ),
    }
    veloeraApi.fetchChannel.mockResolvedValue({ key: "resolved-key" })
    await expect(
      veloeraManagedSiteCapabilities.matching.fetchSecretKey!(
        config,
        modelResourceRef(7, { siteType: "Veloera", scopeKey: config.baseUrl }),
        options,
      ),
    ).resolves.toBe("resolved-key")
    await expect(
      veloeraManagedSiteCapabilities.matching.hydrateComparableKeys!(
        config,
        [
          buildManagedResourceMatchCandidate({
            ref: modelResourceRef(8, {
              siteType: "Veloera",
              scopeKey: config.baseUrl,
            }),
            key: "********",
          }),
        ],
        options,
      ),
    ).resolves.toEqual([
      buildManagedResourceMatchCandidate({
        ref: modelResourceRef(8, {
          siteType: "Veloera",
          scopeKey: config.baseUrl,
        }),
        key: "resolved-key",
      }),
    ])
    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: signal }),
      7,
      options,
    )
    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: signal }),
      8,
      options,
    )
  })
  const buildManagedSiteChannel = (
    overrides: Partial<NewApiChannel> = {},
  ): NewApiChannel =>
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
    }) satisfies NewApiChannel

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createPayload = { name: "channel", status: 1 } as const
  const updatePayload = { id: 7, name: "updated" }
  const models = ["model-a", "model-b"]
  const modelMapping = { "model-a": "upstream-model-a" }

  const arrangeRestMutation =
    (
      mock: typeof veloeraApi.createChannel,
      successData: unknown,
      responseError = false,
    ) =>
    (scenario: ChannelMutationScenario) => {
      const raw =
        scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation
          ? new DOMException("cancelled", "AbortError")
          : new TypeError("Failed to fetch")
      const rejectionResponse = responseError
        ? new ApiError("provider rejected", undefined, "/api/channel")
        : {
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
        if (scenario === CHANNEL_MUTATION_SCENARIOS.Rejected) {
          if (responseError) throw rejectionResponse
          return rejectionResponse
        }
        return responseError
          ? undefined
          : { success: true, data: successData, message: "success" }
      })
      return { raw, rejectionResponse }
    }

  testManagedSiteChannelMutationContract([
    {
      name: "create",
      effect: { kind: "resource-created", resourceKind: "channel" },
      successData: { id: 17 },
      arrange: arrangeRestMutation(veloeraApi.createChannel, { id: 17 }),
      invoke: async () => {
        const { veloeraChannelOperations } = await import(
          "~/services/apiAdapters/managedResources/veloeraOperations"
        )
        return await veloeraChannelOperations.create(config, createPayload)
      },
      assertRequestPayload: () =>
        expect(veloeraApi.createChannel.mock.calls.at(-1)?.[1]).toBe(
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
      arrange: arrangeRestMutation(veloeraApi.updateChannel, { id: 7 }),
      invoke: async () => {
        const { veloeraChannelOperations } = await import(
          "~/services/apiAdapters/managedResources/veloeraOperations"
        )
        return await veloeraChannelOperations.update(config, updatePayload)
      },
      assertRequestPayload: () =>
        expect(veloeraApi.updateChannel.mock.calls.at(-1)?.[1]).toBe(
          updatePayload,
        ),
    },
    {
      name: "delete",
      effect: {
        kind: "resource-deleted",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(veloeraApi.deleteChannel, null),
      invoke: async () => {
        const { veloeraChannelOperations } = await import(
          "~/services/apiAdapters/managedResources/veloeraOperations"
        )
        return await veloeraChannelOperations.delete(config, 7)
      },
      assertRequestPayload: () =>
        expect(veloeraApi.deleteChannel.mock.calls.at(-1)?.[1]).toBe(7),
    },
    {
      name: "updateModels",
      effect: {
        kind: "models-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(veloeraApi.updateChannelModels, null, true),
      invoke: async () => {
        return await veloeraManagedResourceModels.updateModels!(
          config,
          modelResourceRef(7, {
            siteType: "Veloera",
            scopeKey: config.baseUrl,
          }),
          models,
        )
      },
      assertRequestPayload: () =>
        expect(
          veloeraApi.updateChannelModels.mock.calls.at(-1)?.slice(1),
        ).toEqual([7, "model-a,model-b", undefined]),
    },
    {
      name: "updateModelMapping",
      effect: {
        kind: "model-mapping-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(
        veloeraApi.updateChannelModelMapping,
        null,
        true,
      ),
      invoke: async () => {
        return await veloeraManagedResourceModels.updateModelMapping!(
          config,
          modelResourceRef(7, {
            siteType: "Veloera",
            scopeKey: config.baseUrl,
          }),
          models,
          modelMapping,
        )
      },
      assertRequestPayload: () =>
        expect(
          veloeraApi.updateChannelModelMapping.mock.calls.at(-1)?.slice(1),
        ).toEqual([
          7,
          "model-a,model-b",
          JSON.stringify(modelMapping),
          undefined,
        ]),
    },
  ])

  it("preserves non-Veloera error identity for void mutations", async () => {
    const responseError = new Error("malformed provider response")
    veloeraApi.updateChannelModels.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      throw responseError
    })

    await expect(
      veloeraManagedResourceModels.updateModels!(
        config,
        modelResourceRef(7, { siteType: "Veloera", scopeKey: config.baseUrl }),
        models,
      ),
    ).rejects.toBe(responseError)
  })

  it("uses fixed diagnostic copy when a Veloera void error message is blank", async () => {
    const responseError = new ApiError("   ")
    veloeraApi.updateChannelModels.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      throw responseError
    })

    await expect(
      veloeraManagedResourceModels.updateModels!(
        config,
        modelResourceRef(7, { siteType: "Veloera", scopeKey: config.baseUrl }),
        models,
      ),
    ).resolves.toEqual({
      outcome: "rejected",
      diagnostic: {
        message: "Provider rejected the mutation",
        raw: responseError,
      },
    })
  })

  it("keeps response-valued Veloera error identity in the diagnostic", async () => {
    const responseError = new ApiError(
      "malformed provider response",
      502,
      "/api/channel",
      "BUSINESS_ERROR",
    )
    veloeraApi.createChannel.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      throw responseError
    })
    const { veloeraChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/veloeraOperations"
    )

    await expect(
      veloeraChannelOperations.create(config, createPayload),
    ).resolves.toEqual({
      outcome: "uncertain",
      diagnostic: {
        message: "malformed provider response",
        code: "BUSINESS_ERROR",
        statusCode: 502,
        raw: responseError,
      },
    })
  })

  it("uses fixed diagnostic copy when a Veloera rejection message is blank", async () => {
    const rejectionResponse = { success: false, data: null, message: "   " }
    veloeraApi.createChannel.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      return rejectionResponse
    })
    const { veloeraChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/veloeraOperations"
    )

    await expect(
      veloeraChannelOperations.create(config, createPayload),
    ).resolves.toEqual({
      outcome: "rejected",
      diagnostic: {
        message: "Provider rejected the mutation",
        raw: rejectionResponse,
      },
    })
  })

  it("delegates channel operations to direct Veloera helpers", async () => {
    const { veloeraChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/veloeraOperations"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    await veloeraChannelOperations.list?.(config, {
      beforeRequest: vi.fn(),
      bypassSiteRequestLimit: true,
    })
    await veloeraChannelOperations.create(config, {
      name: "channel",
      status: 1,
    })
    await veloeraChannelOperations.update(config, { id: 1 })
    await veloeraChannelOperations.delete(config, 1)
    const fetchModelsSignal = new AbortController().signal
    await veloeraManagedResourceModels.fetchModels?.(
      config,
      modelResourceRef(1, { siteType: "Veloera", scopeKey: config.baseUrl }),
      {
        signal: fetchModelsSignal,
      },
    )
    await veloeraManagedResourceModels.updateModels?.(
      config,
      modelResourceRef(1, { siteType: "Veloera", scopeKey: config.baseUrl }),
      ["gpt-4o", "claude-3"],
      { signal: new AbortController().signal },
    )
    await veloeraManagedResourceModels.updateModelMapping?.(
      config,
      modelResourceRef(1, { siteType: "Veloera", scopeKey: config.baseUrl }),
      ["gpt-4o", "claude-3"],
      { "gpt-4o": "gpt-4o" },
      { signal: new AbortController().signal },
    )

    expect(veloeraApi.listAllChannels).toHaveBeenCalledWith(
      { ...request, bypassSiteRequestLimit: true },
      {
        beforeRequest: expect.any(Function),
        bypassSiteRequestLimit: true,
      },
    )
    expect(veloeraApi.createChannel).toHaveBeenCalledWith(
      expect.objectContaining(request),
      { name: "channel", status: 1 },
    )
    expect(veloeraApi.updateChannel).toHaveBeenCalledWith(
      expect.objectContaining(request),
      { id: 1 },
    )
    expect(veloeraApi.deleteChannel).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
    )
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

  it("exposes native detail and draft-model reads with request cancellation", async () => {
    const { veloeraChannelOperations } = await import(
      "~/services/apiAdapters/managedResources/veloeraOperations"
    )
    const detailSignal = new AbortController().signal
    const draftSignal = new AbortController().signal
    const detail = buildManagedSiteChannel({ id: 23 })
    veloeraApi.fetchChannel.mockResolvedValue(detail)
    veloeraApi.fetchDraftChannelModels.mockResolvedValue(["model-example"])

    await expect(
      veloeraChannelOperations.get?.(config, 23, { signal: detailSignal }),
    ).resolves.toBe(detail)
    await expect(
      veloeraChannelOperations.fetchSecretKey?.(config, 23, {
        protectionBypassExecution: {
          version: 2,
          kind: "user_command",
          command: "manage_site_channels",
          surface: "options",
        },
        signal: detailSignal,
      }),
    ).resolves.toBe(detail.key)
    await expect(
      veloeraManagedResourceModels.fetchDraftModels?.(
        config,
        {
          channelType: 49,
          baseUrl: "https://upstream.example.invalid",
          credential: "credential-placeholder",
        },
        { signal: draftSignal },
      ),
    ).resolves.toEqual(["model-example"])
    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: config.baseUrl }),
      23,
      { signal: detailSignal },
    )
    expect(veloeraApi.fetchDraftChannelModels).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: config.baseUrl }),
      {
        type: 49,
        baseUrl: "https://upstream.example.invalid",
        key: "credential-placeholder",
      },
      { signal: draftSignal },
    )
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

    await veloeraManagedSiteCapabilities.queries.siteUserGroups!.fetch(config)
    const controller = new AbortController()
    await veloeraManagedSiteCapabilities.queries.siteUserGroups!.fetch(config, {
      signal: controller.signal,
    })
    expect(keyManagement.fetchSiteUserGroups).toHaveBeenLastCalledWith({
      ...request,
      abortSignal: controller.signal,
    })
    await veloeraManagedSiteCapabilities.queries.accountAvailableModels!.fetch(
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
      veloeraManagedSiteCapabilities.matching.fetchSecretKey?.(
        config,
        modelResourceRef(42, { siteType: "Veloera", scopeKey: config.baseUrl }),
      ),
    ).resolves.toBe("veloera-secret")
    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(request, 42)

    veloeraApi.fetchChannel.mockResolvedValueOnce({
      id: 7,
      key: "veloera-hydrated",
    })
    await expect(
      veloeraManagedSiteCapabilities.matching.hydrateComparableKeys?.(config, [
        buildManagedResourceMatchCandidate({
          ref: modelResourceRef(1, {
            siteType: "Veloera",
            scopeKey: config.baseUrl,
          }),
          key: "sk-live",
        }),
        buildManagedResourceMatchCandidate({
          ref: modelResourceRef(7, {
            siteType: "Veloera",
            scopeKey: config.baseUrl,
          }),
          key: "sk-********",
        }),
      ]),
    ).resolves.toEqual([
      buildManagedResourceMatchCandidate({
        ref: modelResourceRef(1, {
          siteType: "Veloera",
          scopeKey: config.baseUrl,
        }),
        key: "sk-live",
      }),
      buildManagedResourceMatchCandidate({
        ref: modelResourceRef(7, {
          siteType: "Veloera",
          scopeKey: config.baseUrl,
        }),
        key: "veloera-hydrated",
      }),
    ])
    expect(veloeraApi.fetchChannel).toHaveBeenCalledWith(request, 7)
  })
})
