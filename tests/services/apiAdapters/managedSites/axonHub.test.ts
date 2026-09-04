import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  AXON_HUB_GRAPHQL_ERROR_CODES,
} from "~/constants/axonHub"
import { CHANNEL_STATUS } from "~/types/managedSite"
import {
  CHANNEL_MUTATION_SCENARIOS,
  testManagedSiteChannelMutationContract,
  type ChannelMutationScenario,
} from "~~/tests/services/apiAdapters/managedSites/channelMutationContract"

const axonHubProvider = vi.hoisted(() => ({
  checkValidAxonHubConfig: vi.fn(),
  listChannels: vi.fn(),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
}))

const axonHubApi = vi.hoisted(() => {
  class AxonHubRequestError extends Error {
    constructor(
      readonly kind:
        | "authentication"
        | "permission"
        | "not-found"
        | "upstream-rejected"
        | "protocol"
        | "unavailable"
        | "aborted",
      readonly dispatch: "not-dispatched" | "dispatched",
      message: string = kind,
      details: {
        responseReceived?: boolean
        statusCode?: number
        code?: string
        raw?: unknown
        cause?: unknown
      } = {},
    ) {
      super(message)
      this.name = "AxonHubRequestError"
      this.responseReceived = details.responseReceived ?? false
      this.statusCode = details.statusCode
      this.code = details.code
      this.raw = details.raw
      this.cause = details.cause ?? details.raw
    }

    readonly responseReceived: boolean
    readonly statusCode?: number
    readonly code?: string
    readonly raw?: unknown
    override readonly cause?: unknown
  }

  return {
    AxonHubRequestError,
    axonHubChannelToManagedSite: vi.fn((channel) => ({ id: channel.id })),
    getAxonHubChannel: vi.fn(),
    createAxonHubChannel: vi.fn(),
    updateAxonHubChannel: vi.fn(),
    updateAxonHubChannelStatus: vi.fn(),
    deleteAxonHubChannel: vi.fn(),
    resolveAxonHubGraphqlIdForMutation: vi.fn(),
  }
})

const userPreferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/axonHub", () => ({
  ...axonHubProvider,
}))

vi.mock("~/services/apiService/axonHub", () => ({
  ...axonHubApi,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences,
}))

describe("AxonHub managed-site channel capability", () => {
  const config = {
    baseUrl: "https://axonhub.example.invalid",
    email: "admin@example.invalid",
    password: "password",
  }
  const currentChannel = {
    __typename: "Channel" as const,
    id: "gid://axonhub/Channel/1",
    type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    name: "current",
    baseURL: "https://current.example.invalid/v1",
    status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    credentials: { apiKeys: ["key-current"] },
    supportedModels: ["model-current"],
    manualModels: ["model-current"],
    defaultTestModel: "model-current",
    orderingWeight: 0,
  }

  const dispatchedFailureCases = [
    ["authentication", 401, "UNAUTHENTICATED", "authentication failed"],
    ["permission", 403, "FORBIDDEN", "permission denied"],
    ["not-found", 404, "NOT_FOUND", "channel was not found"],
    ["upstream-rejected", 422, "BAD_USER_INPUT", "mutation rejected"],
    ["protocol", 502, "INVALID_ENVELOPE", "invalid GraphQL response"],
    ["unavailable", 503, "UNAVAILABLE", "service unavailable"],
    ["aborted", 499, "ABORTED", "request aborted after dispatch"],
  ] as const

  const dispatchedOperationCases = (
    ["create", "update", "delete"] as const
  ).flatMap((operation) =>
    dispatchedFailureCases.map(
      ([kind, status, code, message]) =>
        [operation, kind, status, code, message] as const,
    ),
  )

  const terminalMutationCases = [
    { terminal: "applied" as const },
    {
      terminal: "rejected" as const,
      kind: "aborted" as const,
      dispatch: "not-dispatched" as const,
      status: 499,
      code: "ABORTED_BEFORE_SEND",
      message: "request aborted before dispatch",
    },
    ...dispatchedFailureCases.map(([kind, status, code, message]) => ({
      terminal: "uncertain" as const,
      kind,
      dispatch: "dispatched" as const,
      status,
      code,
      message,
    })),
  ]

  const createNativeRequestError = (input: {
    kind: (typeof dispatchedFailureCases)[number][0]
    dispatch: "not-dispatched" | "dispatched"
    status: number
    code: string
    message: string
  }) =>
    new axonHubApi.AxonHubRequestError(
      input.kind,
      input.dispatch,
      input.message,
      {
        responseReceived: true,
        statusCode: input.status,
        code: input.code,
      },
    )

  beforeEach(() => {
    vi.resetAllMocks()
    axonHubApi.axonHubChannelToManagedSite.mockImplementation((channel) => ({
      id: channel.id,
    }))
    axonHubApi.resolveAxonHubGraphqlIdForMutation.mockResolvedValue(
      "gid://axonhub/Channel/1",
    )
    axonHubApi.getAxonHubChannel.mockResolvedValue(currentChannel)
  })

  const arrangeNativeMutation =
    (mock: typeof axonHubApi.createAxonHubChannel, successData: unknown) =>
    (scenario: ChannelMutationScenario) => {
      const raw =
        scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation
          ? Object.assign(new DOMException("cancelled", "AbortError"), {
              dispatch: "not-dispatched" as const,
            })
          : new axonHubApi.AxonHubRequestError("unavailable", "dispatched")
      const rejectionResponse = new axonHubApi.AxonHubRequestError(
        "upstream-rejected",
        "not-dispatched",
        "provider rejected",
      )
      mock.mockImplementation(async () => {
        if (scenario === CHANNEL_MUTATION_SCENARIOS.Rejected) {
          throw rejectionResponse
        }
        if (
          scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation ||
          scenario === CHANNEL_MUTATION_SCENARIOS.PostDispatchAmbiguity
        ) {
          throw raw
        }
        return successData
      })
      return {
        raw,
        rejectionResponse,
        ...(scenario === CHANNEL_MUTATION_SCENARIOS.PostDispatchAmbiguity
          ? {
              expectedAmbiguousDiagnostic: {
                message: "unavailable",
                raw,
              },
            }
          : {}),
      }
    }

  const createPayload = {
    mode: "single",
    channel: {
      name: "channel",
      type: "openai",
      status: 0,
      key: "sk-example",
      base_url: "https://upstream.example.invalid/v1",
      models: "gpt-example",
      weight: 3,
    },
  } as const

  testManagedSiteChannelMutationContract([
    {
      name: "create",
      effect: { kind: "resource-created", resourceKind: "channel" },
      successData: { id: "gid://axonhub/Channel/1" },
      arrange: arrangeNativeMutation(axonHubApi.createAxonHubChannel, {
        id: "gid://axonhub/Channel/1",
      }),
      invoke: async () => {
        const { axonHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/axonHub"
        )
        return await axonHubManagedSiteChannels.create(config, createPayload)
      },
      assertRequestPayload: () =>
        expect(axonHubApi.createAxonHubChannel.mock.calls.at(-1)?.[1]).toEqual({
          type: "openai",
          name: "channel",
          baseURL: "https://upstream.example.invalid/v1",
          credentials: { apiKeys: ["sk-example"] },
          supportedModels: ["gpt-example"],
          manualModels: ["gpt-example"],
          defaultTestModel: "gpt-example",
          settings: {},
          orderingWeight: 3,
        }),
    },
    {
      name: "update",
      effect: {
        kind: "resource-updated",
        resourceKind: "channel",
        resourceId: 1,
      },
      successData: { id: "gid://axonhub/Channel/1" },
      arrange: arrangeNativeMutation(axonHubApi.updateAxonHubChannel, {
        id: "gid://axonhub/Channel/1",
      }),
      invoke: async () => {
        const { axonHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/axonHub"
        )
        return await axonHubManagedSiteChannels.update(config, {
          id: 1,
          name: "updated",
        })
      },
      assertRequestPayload: () =>
        expect(
          axonHubApi.updateAxonHubChannel.mock.calls.at(-1)?.slice(1),
        ).toEqual(["gid://axonhub/Channel/1", { name: "updated" }]),
    },
    {
      name: "delete",
      effect: {
        kind: "resource-deleted",
        resourceKind: "channel",
        resourceId: 1,
      },
      successData: undefined,
      arrange: arrangeNativeMutation(axonHubApi.deleteAxonHubChannel, true),
      invoke: async () => {
        const { axonHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/axonHub"
        )
        return await axonHubManagedSiteChannels.delete(config, 1)
      },
      assertRequestPayload: () =>
        expect(axonHubApi.deleteAxonHubChannel.mock.calls.at(-1)?.[1]).toBe(
          "gid://axonhub/Channel/1",
        ),
    },
  ])

  it("rejects an AxonHub channel create without models before dispatch", async () => {
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.create(config, {
        ...createPayload,
        channel: { ...createPayload.channel, models: " , " },
      }),
    ).resolves.toEqual({
      outcome: "rejected",
      diagnostic: expect.objectContaining({
        message: "AxonHub channel models are required",
      }),
    })
    expect(axonHubApi.createAxonHubChannel).not.toHaveBeenCalled()
  })

  it("treats a GraphQL validation failure as confirmed non-application", async () => {
    axonHubApi.createAxonHubChannel.mockRejectedValue(
      createNativeRequestError({
        kind: "upstream-rejected",
        dispatch: "dispatched",
        status: 422,
        code: AXON_HUB_GRAPHQL_ERROR_CODES.VALIDATION_FAILED,
        message: "mutation document was rejected",
      }),
    )
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.create(config, createPayload),
    ).resolves.toEqual({
      outcome: "rejected",
      diagnostic: expect.objectContaining({
        code: AXON_HUB_GRAPHQL_ERROR_CODES.VALIDATION_FAILED,
        statusCode: 422,
      }),
    })
  })

  it("defaults a blank AxonHub channel type to OpenAI", async () => {
    axonHubApi.createAxonHubChannel.mockResolvedValue({
      id: "gid://axonhub/Channel/default-type",
    })
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await axonHubManagedSiteChannels.create(config, {
      ...createPayload,
      channel: { ...createPayload.channel, type: " " },
    })

    expect(axonHubApi.createAxonHubChannel).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ type: AXON_HUB_CHANNEL_TYPE.OPENAI }),
    )
  })

  it("forwards every supplied AxonHub channel update field", async () => {
    axonHubApi.updateAxonHubChannel.mockResolvedValue({
      id: "gid://axonhub/Channel/1",
    })
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await axonHubManagedSiteChannels.update(config, {
      id: 1,
      type: "custom",
      name: " Updated ",
      base_url: " https://updated.example.invalid/v1 ",
      key: " key-updated ",
      models: "model-a, model-b",
      weight: 7,
    })

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      "gid://axonhub/Channel/1",
      {
        type: "custom",
        name: "Updated",
        baseURL: "https://updated.example.invalid/v1",
        credentials: { apiKeys: ["key-updated"] },
        supportedModels: ["model-a", "model-b"],
        manualModels: ["model-a", "model-b"],
        defaultTestModel: "model-a",
        orderingWeight: 7,
      },
    )
  })

  it("only forwards fields that differ from the current AxonHub channel", async () => {
    axonHubApi.updateAxonHubChannel.mockResolvedValue({
      id: "gid://axonhub/Channel/1",
    })
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await axonHubManagedSiteChannels.update(config, {
      id: 1,
      type: "openai",
      name: " renamed ",
      base_url: " https://current.example.invalid/v1 ",
      key: " key-current ",
      models: "model-current",
      weight: 0,
      status: CHANNEL_STATUS.ManuallyDisabled,
    })

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      "gid://axonhub/Channel/1",
      { name: "renamed" },
    )
    expect(axonHubApi.updateAxonHubChannelStatus).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: "legacy apiKey",
      credentials: { apiKey: "legacy-key" },
      submittedKey: "legacy-key",
    },
    {
      label: "unavailable credentials",
      credentials: undefined,
      submittedKey: "",
    },
  ])(
    "does not replace $label while patching another field",
    async ({ credentials, submittedKey }) => {
      axonHubApi.getAxonHubChannel.mockResolvedValueOnce({
        ...currentChannel,
        credentials,
      })
      axonHubApi.updateAxonHubChannel.mockResolvedValue({
        id: currentChannel.id,
      })
      const { axonHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )

      await axonHubManagedSiteChannels.update(config, {
        id: 1,
        name: "renamed",
        key: submittedKey,
      })

      expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
        config,
        currentChannel.id,
        { name: "renamed" },
      )
    },
  )

  it("does not dispatch an AxonHub mutation when the submitted channel is unchanged", async () => {
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.update(config, {
        id: 1,
        type: "openai",
        name: "current",
        base_url: "https://current.example.invalid/v1",
        key: "key-current",
        models: "model-current",
        weight: 0,
        status: CHANNEL_STATUS.ManuallyDisabled,
      }),
    ).resolves.toEqual({
      outcome: "succeeded",
      data: { id: "gid://axonhub/Channel/1" },
      confirmedEffects: [],
    })
    expect(axonHubApi.updateAxonHubChannel).not.toHaveBeenCalled()
    expect(axonHubApi.updateAxonHubChannelStatus).not.toHaveBeenCalled()
  })

  it("treats a false AxonHub delete response as confirmed non-application", async () => {
    axonHubApi.deleteAxonHubChannel.mockResolvedValue(false)
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(axonHubManagedSiteChannels.delete(config, 1)).resolves.toEqual(
      {
        outcome: "rejected",
        diagnostic: {
          message: "Provider rejected the mutation",
          raw: false,
        },
      },
    )
  })

  it.each([
    ["create", axonHubApi.createAxonHubChannel],
    ["update", axonHubApi.updateAxonHubChannel],
    ["delete", axonHubApi.deleteAxonHubChannel],
  ] as const)("rethrows unknown %s programming errors", async (name, mock) => {
    const programmingError = { name, invariant: "broken" }
    mock.mockRejectedValueOnce(programmingError)
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const mutation =
      name === "create"
        ? axonHubManagedSiteChannels.create(config, createPayload)
        : name === "update"
          ? axonHubManagedSiteChannels.update(config, {
              id: 1,
              name: "updated",
            })
          : axonHubManagedSiteChannels.delete(config, 1)

    await expect(mutation).rejects.toBe(programmingError)
  })

  it.each([
    ["create", axonHubApi.createAxonHubChannel],
    ["update", axonHubApi.updateAxonHubChannel],
    ["delete", axonHubApi.deleteAxonHubChannel],
  ] as const)(
    "rethrows %s dispatch lookalikes instead of inferring rejection",
    async (name, mock) => {
      const lookalike = {
        name: "AxonHubRequestError",
        kind: "authentication",
        dispatch: "not-dispatched" as const,
        responseReceived: true,
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "lookalike failure",
      }
      mock.mockRejectedValueOnce(lookalike)
      const { axonHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )
      const mutation =
        name === "create"
          ? axonHubManagedSiteChannels.create(config, createPayload)
          : name === "update"
            ? axonHubManagedSiteChannels.update(config, {
                id: 1,
                name: "updated",
              })
            : axonHubManagedSiteChannels.delete(config, 1)

      await expect(mutation).rejects.toBe(lookalike)
    },
  )

  it.each(dispatchedOperationCases)(
    "keeps native dispatched %s %s failures uncertain",
    async (operation, kind, status, code, message) => {
      const error = createNativeRequestError({
        kind,
        dispatch: "dispatched",
        status,
        code,
        message,
      })
      if (operation === "create") {
        axonHubApi.createAxonHubChannel.mockRejectedValueOnce(error)
      } else if (operation === "update") {
        axonHubApi.updateAxonHubChannel.mockRejectedValueOnce(error)
      } else {
        axonHubApi.deleteAxonHubChannel.mockRejectedValueOnce(error)
      }
      const { axonHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )
      const mutation =
        operation === "create"
          ? axonHubManagedSiteChannels.create(config, createPayload)
          : operation === "update"
            ? axonHubManagedSiteChannels.update(config, {
                id: 1,
                name: "updated",
              })
            : axonHubManagedSiteChannels.delete(config, 1)

      await expect(mutation).resolves.toEqual({
        outcome: "uncertain",
        diagnostic: { message, code, statusCode: status, raw: error },
      })
    },
  )

  it.each(["update", "delete"] as const)(
    "keeps %s ID-resolution failures undispatched",
    async (operation) => {
      const error = new axonHubApi.AxonHubRequestError(
        "not-found",
        "not-dispatched",
      )
      axonHubApi.resolveAxonHubGraphqlIdForMutation.mockRejectedValueOnce(error)
      const { axonHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )
      const mutation =
        operation === "update"
          ? axonHubManagedSiteChannels.update(config, {
              id: 1,
              name: "updated",
            })
          : axonHubManagedSiteChannels.delete(config, 1)

      await expect(mutation).resolves.toEqual({
        outcome: "rejected",
        diagnostic: { message: "not-found", raw: error },
      })
      expect(axonHubApi.updateAxonHubChannel).not.toHaveBeenCalled()
      expect(axonHubApi.deleteAxonHubChannel).not.toHaveBeenCalled()
    },
  )

  it("rethrows update detail-read programming errors before dispatch", async () => {
    const programmingError = new Error("detail invariant failed")
    axonHubApi.getAxonHubChannel.mockRejectedValueOnce(programmingError)
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.update(config, { id: 1, name: "updated" }),
    ).rejects.toBe(programmingError)
    expect(axonHubApi.updateAxonHubChannel).not.toHaveBeenCalled()
  })

  it.each(["update", "delete"] as const)(
    "rejects %s ID-resolution schema failures without confirming a mutation attempt",
    async (operation) => {
      const error = new axonHubApi.AxonHubRequestError(
        "upstream-rejected",
        "not-dispatched",
        "channel lookup document was rejected",
        {
          responseReceived: true,
          statusCode: 422,
          code: AXON_HUB_GRAPHQL_ERROR_CODES.VALIDATION_FAILED,
        },
      )
      axonHubApi.resolveAxonHubGraphqlIdForMutation.mockRejectedValueOnce(error)
      const { axonHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )
      const mutation =
        operation === "update"
          ? axonHubManagedSiteChannels.update(config, {
              id: 1,
              name: "updated",
            })
          : axonHubManagedSiteChannels.delete(config, 1)

      await expect(mutation).resolves.toEqual({
        outcome: "rejected",
        diagnostic: {
          message: "channel lookup document was rejected",
          code: AXON_HUB_GRAPHQL_ERROR_CODES.VALIDATION_FAILED,
          statusCode: 422,
          raw: error,
        },
      })
      expect(axonHubApi.updateAxonHubChannel).not.toHaveBeenCalled()
      expect(axonHubApi.deleteAxonHubChannel).not.toHaveBeenCalled()
    },
  )

  it.each(terminalMutationCases)(
    "composes create plus enable when the status step is $terminal",
    async ({ terminal, kind, dispatch, status, code, message }) => {
      const id = "gid://axonhub/Channel/created"
      axonHubApi.createAxonHubChannel.mockResolvedValue({
        id,
        status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      })
      const terminalError = kind
        ? createNativeRequestError({ kind, dispatch, status, code, message })
        : undefined
      if (terminalError) {
        axonHubApi.updateAxonHubChannelStatus.mockRejectedValue(terminalError)
      } else {
        axonHubApi.updateAxonHubChannelStatus.mockResolvedValue({
          id,
          status: AXON_HUB_CHANNEL_STATUS.ENABLED,
        })
      }
      const { axonHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )
      const result = await axonHubManagedSiteChannels.create(config, {
        ...createPayload,
        channel: {
          ...createPayload.channel,
          status: CHANNEL_STATUS.Enable,
        },
      })
      const firstEffect = {
        kind: "resource-created",
        resourceKind: "channel",
      }
      const secondEffect = {
        kind: "status-updated",
        resourceKind: "channel",
        resourceId: id,
      }

      expect(result).toEqual(
        terminal === "applied"
          ? {
              outcome: "succeeded",
              data: { id },
              confirmedEffects: [firstEffect, secondEffect],
            }
          : {
              outcome: "partial",
              confirmedEffects: [firstEffect],
              completion: terminal,
              diagnostic: {
                message,
                code,
                statusCode: status,
                raw: terminalError,
              },
            },
      )
    },
  )

  it.each(terminalMutationCases)(
    "composes update plus status when the status step is $terminal",
    async ({ terminal, kind, dispatch, status, code, message }) => {
      const id = "gid://axonhub/Channel/1"
      axonHubApi.updateAxonHubChannel.mockResolvedValue({
        id,
        status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      })
      const terminalError = kind
        ? createNativeRequestError({ kind, dispatch, status, code, message })
        : undefined
      if (terminalError) {
        axonHubApi.updateAxonHubChannelStatus.mockRejectedValue(terminalError)
      } else {
        axonHubApi.updateAxonHubChannelStatus.mockResolvedValue({
          id,
          status: AXON_HUB_CHANNEL_STATUS.ENABLED,
        })
      }
      const { axonHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )
      const result = await axonHubManagedSiteChannels.update(config, {
        id: 1,
        name: "updated",
        status: CHANNEL_STATUS.Enable,
      })
      const firstEffect = {
        kind: "resource-updated",
        resourceKind: "channel",
        resourceId: 1,
      }
      const secondEffect = {
        kind: "status-updated",
        resourceKind: "channel",
        resourceId: 1,
      }

      expect(result).toEqual(
        terminal === "applied"
          ? {
              outcome: "succeeded",
              data: { id },
              confirmedEffects: [firstEffect, secondEffect],
            }
          : {
              outcome: "partial",
              confirmedEffects: [firstEffect],
              completion: terminal,
              diagnostic: {
                message,
                code,
                statusCode: status,
                raw: terminalError,
              },
            },
      )
    },
  )

  it.each([
    ["create", "upstream-rejected", "dispatched", "uncertain"],
    ["create", "aborted", "not-dispatched", "rejected"],
    ["update", "upstream-rejected", "dispatched", "uncertain"],
    ["update", "aborted", "not-dispatched", "rejected"],
  ] as const)(
    "does not dispatch %s status after first-step %s",
    async (operation, kind, dispatch, outcome) => {
      const error = new axonHubApi.AxonHubRequestError(kind, dispatch)
      if (operation === "create") {
        axonHubApi.createAxonHubChannel.mockRejectedValueOnce(error)
      } else {
        axonHubApi.updateAxonHubChannel.mockRejectedValueOnce(error)
      }
      const { axonHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )
      const mutation =
        operation === "create"
          ? axonHubManagedSiteChannels.create(config, {
              ...createPayload,
              channel: {
                ...createPayload.channel,
                status: CHANNEL_STATUS.Enable,
              },
            })
          : axonHubManagedSiteChannels.update(config, {
              id: 1,
              name: "updated",
              status: CHANNEL_STATUS.Enable,
            })

      await expect(mutation).resolves.toEqual({
        outcome,
        diagnostic: { message: kind, raw: error },
      })
      expect(axonHubApi.updateAxonHubChannelStatus).not.toHaveBeenCalled()
    },
  )

  it("returns null on search failure via the provider protocol helper", async () => {
    axonHubProvider.searchChannel.mockResolvedValue(null)

    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.search(config, "missing"),
    ).resolves.toBeNull()
  })

  it("exposes direct channel listing without model-sync write methods", async () => {
    const listResponse = {
      items: [{ id: 1, name: "Axon" }],
      total: 1,
      type_counts: { openai: 1 },
    }
    axonHubProvider.listChannels.mockResolvedValue(listResponse)

    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(axonHubManagedSiteChannels.list?.(config)).resolves.toBe(
      listResponse,
    )
    expect(axonHubProvider.listChannels).toHaveBeenCalledWith(config)
    expect(axonHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("does not expose model-sync methods", async () => {
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    expect(axonHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("exposes provider config and draft functions", async () => {
    userPreferences.getPreferences.mockResolvedValue({
      axonHub: config,
    })
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(axonHubManagedSiteCapabilities.config.get()).resolves.toBe(
      config,
    )
    expect(axonHubManagedSiteCapabilities.config.checkValid).toBe(
      axonHubProvider.checkValidAxonHubConfig,
    )
    expect(axonHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: axonHubProvider.fetchAvailableModels,
      buildName: axonHubProvider.buildChannelName,
      prepareFormData: axonHubProvider.prepareChannelFormData,
      buildPayload: axonHubProvider.buildChannelPayload,
    })
    expect(axonHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("returns null when AxonHub runtime config is incomplete", async () => {
    userPreferences.getPreferences.mockResolvedValue({
      axonHub: {
        baseUrl: "",
        email: "",
        password: "",
      },
    })
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.config.get(),
    ).resolves.toBeNull()
  })
})
