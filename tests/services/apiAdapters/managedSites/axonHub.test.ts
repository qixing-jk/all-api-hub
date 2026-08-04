import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import type { AxonHubChannel } from "~/types/axonHub"
import { CHANNEL_STATUS, type ChannelFormData } from "~/types/managedSite"
import {
  CHANNEL_MUTATION_SCENARIOS,
  testManagedSiteChannelMutationContract,
  type ChannelMutationScenario,
} from "~~/tests/services/apiAdapters/managedSites/channelMutationContract"
import { testManagedUpstreamResourceMutationContract } from "~~/tests/services/apiAdapters/managedSites/resourceMutationContract"

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
    readonly cause?: unknown
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

  const resourceNative: AxonHubChannel = {
    id: "gid://axonhub/Channel/resource",
    name: "Axon Resource",
    type: "openai",
    status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    baseURL: "https://resource.example.invalid/v1",
    credentials: { apiKeys: ["sk-resource"] },
    supportedModels: ["gpt-example"],
    manualModels: ["gpt-example"],
    defaultTestModel: "gpt-example",
    settings: { passThroughBody: true },
    orderingWeight: 3,
    remark: "preserve",
  }
  const resourceDraft: ChannelFormData = {
    name: "Axon Resource Edited",
    type: "openai",
    key: "sk-resource",
    base_url: "https://resource.example.invalid/v1",
    models: ["gpt-example"],
    groups: [],
    priority: 0,
    weight: 3,
    status: CHANNEL_STATUS.ManuallyDisabled,
  }
  const resourceDetail = {
    summary: {
      ref: {
        managedSiteType: SITE_TYPES.AXON_HUB,
        scopeKey: "https://axonhub.example.invalid",
        resourceId: resourceNative.id,
      },
      displayName: resourceNative.name,
      nativeKind: "channel",
      status: "disabled",
      secretState: "available",
      capabilities: { canUpdate: true },
    },
    native: resourceNative,
  } as const

  testManagedUpstreamResourceMutationContract([
    {
      name: "create",
      effect: { kind: "resource-created", resourceKind: "channel" },
      successData: expect.objectContaining({
        displayName: resourceNative.name,
        nativeKind: "channel",
      }),
      arrange: arrangeNativeMutation(
        axonHubApi.createAxonHubChannel,
        resourceNative,
      ),
      invoke: async () => {
        const { axonHubManagedSiteCapabilities } = await import(
          "~/services/apiAdapters/managedSites/axonHub"
        )
        return await axonHubManagedSiteCapabilities.resources!.items.create(
          config,
          { ...resourceDraft, name: resourceNative.name },
        )
      },
      assertRequestPayload: () =>
        expect(axonHubApi.createAxonHubChannel.mock.calls.at(-1)?.[1]).toEqual(
          expect.objectContaining({
            name: resourceNative.name,
            settings: {},
          }),
        ),
    },
    {
      name: "update",
      effect: {
        kind: "resource-updated",
        resourceKind: "channel",
        resourceId: resourceNative.id,
      },
      successData: expect.objectContaining({
        displayName: resourceNative.name,
        nativeKind: "channel",
      }),
      arrange: arrangeNativeMutation(
        axonHubApi.updateAxonHubChannel,
        resourceNative,
      ),
      invoke: async () => {
        const { axonHubManagedSiteCapabilities } = await import(
          "~/services/apiAdapters/managedSites/axonHub"
        )
        return await axonHubManagedSiteCapabilities.resources!.items.update(
          config,
          resourceDetail,
          { ...resourceDraft, name: resourceNative.name },
        )
      },
      assertRequestPayload: () =>
        expect(axonHubApi.updateAxonHubChannel.mock.calls.at(-1)?.[2]).toEqual(
          expect.objectContaining({
            settings: { passThroughBody: true },
            remark: "preserve",
            supportedModels: ["gpt-example"],
          }),
        ),
    },
    {
      name: "delete",
      effect: {
        kind: "resource-deleted",
        resourceKind: "channel",
        resourceId: resourceNative.id,
      },
      successData: undefined,
      arrange: arrangeNativeMutation(axonHubApi.deleteAxonHubChannel, true),
      invoke: async () => {
        const { axonHubManagedSiteCapabilities } = await import(
          "~/services/apiAdapters/managedSites/axonHub"
        )
        return await axonHubManagedSiteCapabilities.resources!.items.delete(
          config,
          resourceDetail.summary.ref,
        )
      },
      assertRequestPayload: () =>
        expect(axonHubApi.deleteAxonHubChannel.mock.calls.at(-1)?.[1]).toBe(
          resourceNative.id,
        ),
    },
  ])

  it.each(["create", "update"] as const)(
    "composes AxonHub resource %s plus terminal status evidence",
    async (operation) => {
      for (const terminal of terminalMutationCases) {
        vi.clearAllMocks()
        const first = {
          ...resourceNative,
          status: AXON_HUB_CHANNEL_STATUS.DISABLED,
        }
        if (operation === "create") {
          axonHubApi.createAxonHubChannel.mockResolvedValue(first)
        } else {
          axonHubApi.updateAxonHubChannel.mockResolvedValue(first)
        }
        const terminalError = terminal.kind
          ? createNativeRequestError({
              kind: terminal.kind,
              dispatch: terminal.dispatch,
              status: terminal.status,
              code: terminal.code,
              message: terminal.message,
            })
          : undefined
        if (terminalError) {
          axonHubApi.updateAxonHubChannelStatus.mockRejectedValue(terminalError)
        } else {
          axonHubApi.updateAxonHubChannelStatus.mockResolvedValue({
            ...first,
            status: AXON_HUB_CHANNEL_STATUS.ENABLED,
          })
        }
        const { axonHubManagedSiteCapabilities } = await import(
          "~/services/apiAdapters/managedSites/axonHub"
        )
        const resources = axonHubManagedSiteCapabilities.resources!
        const result =
          operation === "create"
            ? await resources.items.create(config, {
                ...resourceDraft,
                name: resourceNative.name,
                status: CHANNEL_STATUS.Enable,
              })
            : await resources.items.update(config, resourceDetail, {
                ...resourceDraft,
                name: resourceNative.name,
                status: CHANNEL_STATUS.Enable,
              })
        const firstEffect = {
          kind:
            operation === "create"
              ? ("resource-created" as const)
              : ("resource-updated" as const),
          resourceKind: "channel" as const,
          ...(operation === "update" ? { resourceId: resourceNative.id } : {}),
        }

        if (terminal.terminal === "applied") {
          expect(result).toEqual({
            outcome: "succeeded",
            data: expect.objectContaining({
              status: "enabled",
              ref: expect.objectContaining({
                resourceId: resourceNative.id,
              }),
            }),
            confirmedEffects: [
              firstEffect,
              {
                kind: "status-updated",
                resourceKind: "channel",
                resourceId: resourceNative.id,
              },
            ],
          })
        } else {
          expect(result).toEqual({
            outcome: "partial",
            confirmedEffects: [firstEffect],
            completion: terminal.terminal,
            diagnostic: {
              message: terminal.message,
              code: terminal.code,
              statusCode: terminal.status,
              raw: terminalError,
            },
          })
        }
      }
    },
  )

  it.each(["create", "update"] as const)(
    "does not dispatch AxonHub resource %s status after first-step rejection",
    async (operation) => {
      const error = new axonHubApi.AxonHubRequestError(
        "upstream-rejected",
        "not-dispatched",
        "provider rejected",
      )
      if (operation === "create") {
        axonHubApi.createAxonHubChannel.mockRejectedValue(error)
      } else {
        axonHubApi.updateAxonHubChannel.mockRejectedValue(error)
      }
      const { axonHubManagedSiteCapabilities } = await import(
        "~/services/apiAdapters/managedSites/axonHub"
      )
      const resources = axonHubManagedSiteCapabilities.resources!
      const result =
        operation === "create"
          ? await resources.items.create(config, {
              ...resourceDraft,
              status: CHANNEL_STATUS.Enable,
            })
          : await resources.items.update(config, resourceDetail, {
              ...resourceDraft,
              status: CHANNEL_STATUS.Enable,
            })

      expect(result).toEqual({
        outcome: "rejected",
        diagnostic: { message: "provider rejected", raw: error },
      })
      expect(axonHubApi.updateAxonHubChannelStatus).not.toHaveBeenCalled()
    },
  )

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

  it.each(terminalMutationCases)(
    "composes create plus enable when the status step is %s",
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
    "composes update plus status when the status step is %s",
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

  it("maps AxonHub GraphQL channels into string-id resource summaries", async () => {
    const native = buildAxonHubChannel({
      id: "gid://axonhub/Channel/native-string-id",
      type: "custom_native",
      supportedModels: ["gpt-4o"],
      manualModels: ["claude-3-5-sonnet"],
      orderingWeight: 7,
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { custom_native: 1 },
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.list(config),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          ref: {
            managedSiteType: SITE_TYPES.AXON_HUB,
            scopeKey: "https://axonhub.example.invalid",
            resourceId: "gid://axonhub/Channel/native-string-id",
          },
          displayName: "Axon Native",
          nativeKind: "channel",
          status: "enabled",
          typeLabel: "custom_native",
          endpointLabel: "https://upstream.example.invalid/v1",
          modelCount: 2,
          modelPreview: ["gpt-4o", "claude-3-5-sonnet"],
          secretState: "available",
          capabilities: {
            canCreate: true,
            canUpdate: true,
            canDelete: true,
            canRevealSecret: false,
          },
        }),
      ],
      total: 1,
    })
  })

  it("maps AxonHub resource search results into string-id resource summaries", async () => {
    const native = buildAxonHubChannel({
      id: "gid://axonhub/Channel/search-string-id",
      name: "Search Result",
      type: "openrouter",
      supportedModels: ["openrouter/auto"],
      manualModels: [],
    })
    axonHubProvider.searchChannel.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openrouter: 1 },
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.search(config, "search"),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          ref: expect.objectContaining({
            managedSiteType: SITE_TYPES.AXON_HUB,
            resourceId: "gid://axonhub/Channel/search-string-id",
          }),
          displayName: "Search Result",
          typeLabel: "OpenRouter",
          modelCount: 1,
          modelPreview: ["openrouter/auto"],
        }),
      ],
      total: 1,
    })
  })

  it("returns null when AxonHub resource search misses", async () => {
    axonHubProvider.searchChannel.mockResolvedValue(null)

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.search(config, "missing"),
    ).resolves.toBeNull()
  })

  it("maps AxonHub single-key and unavailable credential states", async () => {
    const singleKeyNative = buildAxonHubChannel({
      id: "gid://axonhub/Channel/single-key",
      credentials: {
        apiKey: "sk-single-key",
      },
    })
    const noKeyNative = buildAxonHubChannel({
      id: "gid://axonhub/Channel/no-key",
      credentials: {},
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [
        buildAxonHubChannelRow(singleKeyNative),
        buildAxonHubChannelRow(noKeyNative),
      ],
      total: 2,
      type_counts: { openai: 2 },
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.list(config),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          ref: expect.objectContaining({ resourceId: singleKeyNative.id }),
          secretState: "available",
        }),
        expect.objectContaining({
          ref: expect.objectContaining({ resourceId: noKeyNative.id }),
          secretState: "unavailable",
        }),
      ],
      total: 2,
    })
  })

  it("fetches native detail before edit and preserves AxonHub-only fields on update", async () => {
    const native = buildAxonHubChannel({
      id: "gid://axonhub/Channel/native-string-id",
      type: "anthropic_gcp",
      credentials: {
        apiKeys: ["sk-live-native"],
        gcp: {
          region: "us-central1",
          projectID: "example-project",
          jsonData: '{"client_email":"svc@example.invalid"}',
        },
      },
      supportedModels: ["claude-3-5-sonnet"],
      manualModels: ["claude-3-opus"],
      defaultTestModel: "claude-3-opus",
      settings: {
        hideMappedModels: true,
        modelMappings: [{ from: "claude-3", to: "claude-3-5-sonnet" }],
      },
      orderingWeight: 12,
      remark: "native remark",
    })
    const updated = { ...native, name: "Axon Updated" }
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue(updated)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(updated),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const ref = {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    }
    const listCallsBefore = axonHubProvider.listChannels.mock.calls.length

    const detail = await resources.items.getDetail(config, ref)
    const draft = resources.drafts.prepareEditDraft(detail)
    await resources.items.update(config, detail, {
      ...draft,
      name: "Axon Updated",
    })

    expect(detail.native).toBe(native)
    expect(axonHubApi.getAxonHubChannel).toHaveBeenCalledWith(config, native.id)
    expect(axonHubProvider.listChannels).toHaveBeenCalledTimes(listCallsBefore)
    expect(draft).toEqual({
      name: "Axon Native",
      type: "anthropic_gcp",
      key: "sk-live-native",
      base_url: "https://upstream.example.invalid/v1",
      models: ["claude-3-5-sonnet", "claude-3-opus"],
      groups: [],
      priority: 0,
      weight: 12,
      status: CHANNEL_STATUS.Enable,
    })
    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      "gid://axonhub/Channel/native-string-id",
      {
        type: "anthropic_gcp",
        name: "Axon Updated",
        baseURL: "https://upstream.example.invalid/v1",
        credentials: native.credentials,
        supportedModels: ["claude-3-5-sonnet"],
        manualModels: ["claude-3-opus"],
        defaultTestModel: "claude-3-opus",
        settings: native.settings,
        orderingWeight: 12,
        remark: "native remark",
      },
    )
    expect(axonHubApi.updateAxonHubChannelStatus).not.toHaveBeenCalled()
  })

  it("rejects stale AxonHub resource refs from a different site or scope before native access", async () => {
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!

    await expect(
      resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.NEW_API,
        scopeKey: "https://axonhub.example.invalid",
        resourceId: "gid://axonhub/Channel/native-string-id",
      }),
    ).rejects.toThrow("Resource reference does not match this managed site")
    await expect(
      resources.items.delete(config, {
        managedSiteType: SITE_TYPES.AXON_HUB,
        scopeKey: "https://other.example.invalid",
        resourceId: "gid://axonhub/Channel/native-string-id",
      }),
    ).rejects.toThrow("Resource reference does not match this managed site")

    expect(axonHubProvider.listChannels).not.toHaveBeenCalled()
    expect(axonHubApi.deleteAxonHubChannel).not.toHaveBeenCalled()
  })

  it("preserves null AxonHub settings when building resource update payloads", async () => {
    const native = buildAxonHubChannel({
      settings: null,
    })
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(
      config,
      detail,
      resources.drafts.prepareEditDraft(detail),
    )

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.objectContaining({
        settings: null,
      }),
    )
  })

  it("preserves multi-key AxonHub credentials when the draft key is unchanged", async () => {
    const native = buildAxonHubChannel({
      credentials: {
        apiKeys: ["sk-primary", "sk-secondary"],
      },
    })
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue({
      ...native,
      name: "Renamed Axon",
    })
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow({ ...native, name: "Renamed Axon" }),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })
    const draft = resources.drafts.prepareEditDraft(detail)

    expect(draft.key).toBe("sk-primary")

    await resources.items.update(config, detail, {
      ...draft,
      name: "Renamed Axon",
    })

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenLastCalledWith(
      config,
      native.id,
      expect.objectContaining({
        credentials: native.credentials,
      }),
    )
  })

  it("preserves native AxonHub model arrays even when the generic model draft changes", async () => {
    const native = buildAxonHubChannel({
      supportedModels: ["native-supported"],
      manualModels: ["native-manual"],
      defaultTestModel: "native-manual",
    })
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(config, detail, {
      ...resources.drafts.prepareEditDraft(detail),
      models: ["draft-edited-model"],
    })

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.objectContaining({
        supportedModels: ["native-supported"],
        manualModels: ["native-manual"],
        defaultTestModel: "native-manual",
      }),
    )
  })

  it("preserves nullable AxonHub default model and ordering weight on no-op edits", async () => {
    const native = buildAxonHubChannel({
      supportedModels: ["native-supported"],
      manualModels: ["native-manual"],
      defaultTestModel: null,
      orderingWeight: null,
    })
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(
      config,
      detail,
      resources.drafts.prepareEditDraft(detail),
    )

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.objectContaining({
        defaultTestModel: null,
        orderingWeight: null,
      }),
    )
  })

  it("does not expose an editable generic models field for AxonHub resource edits", async () => {
    const native = buildAxonHubChannel({
      supportedModels: ["native-supported"],
      manualModels: ["native-manual"],
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const descriptors =
      axonHubManagedSiteCapabilities.resources!.drafts.describeFields({
        mode: "edit",
        detail: {
          summary: {
            ref: {
              managedSiteType: SITE_TYPES.AXON_HUB,
              scopeKey: "https://axonhub.example.invalid",
              resourceId: native.id,
            },
            displayName: native.name,
            nativeKind: "channel",
            status: "enabled",
            secretState: "available",
            capabilities: { canUpdate: true },
          },
          native,
        },
      })

    expect(descriptors.map((descriptor) => descriptor.name)).not.toContain(
      "models",
    )
  })

  it("prepares and validates AxonHub resource import drafts", async () => {
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const sourceDraft = {
      name: "Source Axon",
      type: "openai",
      key: "sk-source",
      base_url: "https://source.example.invalid/v1",
      models: ["gpt-4o"],
      groups: [],
      priority: 0,
      weight: 3,
      status: CHANNEL_STATUS.Enable,
    }

    await expect(
      resources.drafts.prepareImportDraft({ source: sourceDraft }),
    ).resolves.toBe(sourceDraft)
    await expect(
      resources.drafts.prepareImportDraft({
        resource: {
          ref: {
            managedSiteType: SITE_TYPES.AXON_HUB,
            scopeKey: "https://axonhub.example.invalid",
            resourceId: "gid://axonhub/Channel/imported",
          },
          displayName: "Imported Axon",
          nativeKind: "channel",
          status: "enabled",
          endpointLabel: "https://imported.example.invalid/v1",
          modelPreview: ["gpt-4o"],
          secretState: "masked",
          capabilities: {},
        },
      }),
    ).resolves.toEqual({
      name: "Imported Axon",
      type: "openai",
      key: "",
      base_url: "https://imported.example.invalid/v1",
      models: ["gpt-4o"],
      groups: [],
      priority: 0,
      weight: 0,
      status: CHANNEL_STATUS.Enable,
    })

    expect(
      resources.drafts.validateDraft({
        ...sourceDraft,
        name: " ",
        base_url: "",
      }),
    ).toEqual({
      valid: false,
      errors: [
        { field: "name", message: "Channel name is required" },
        { field: "base_url", message: "Base URL is required" },
      ],
    })
  })

  it("allows AxonHub resource edits when native model arrays are empty or nullable", async () => {
    const native = buildAxonHubChannel({
      supportedModels: null,
      manualModels: [],
      defaultTestModel: null,
    })
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue({
      ...native,
      name: "Renamed Axon",
    })
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow({ ...native, name: "Renamed Axon" }),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })
    const draft = {
      ...resources.drafts.prepareEditDraft(detail),
      name: "Renamed Axon",
    }

    expect(resources.drafts.validateDraft(draft)).toEqual({
      valid: true,
      errors: [],
    })

    await resources.items.update(config, detail, draft)

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.objectContaining({
        name: "Renamed Axon",
        supportedModels: null,
        manualModels: [],
        defaultTestModel: null,
      }),
    )
  })

  it("preserves archived AxonHub status on resource edits", async () => {
    const native = buildAxonHubChannel({
      status: AXON_HUB_CHANNEL_STATUS.ARCHIVED,
    })
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(
      config,
      detail,
      resources.drafts.prepareEditDraft(detail),
    )

    expect(axonHubApi.updateAxonHubChannelStatus).not.toHaveBeenCalled()
  })

  it("updates AxonHub native status when a resource edit changes it", async () => {
    const native = buildAxonHubChannel({
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
    })
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow({
        ...native,
        status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      }),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(config, detail, {
      ...resources.drafts.prepareEditDraft(detail),
      status: CHANNEL_STATUS.ManuallyDisabled,
    })

    expect(axonHubApi.updateAxonHubChannelStatus).toHaveBeenCalledWith(
      config,
      native.id,
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )
  })

  it("fails closed when an AxonHub resource row is missing native channel detail", async () => {
    axonHubProvider.listChannels.mockResolvedValue({
      items: [
        {
          ...buildAxonHubChannelRow(buildAxonHubChannel()),
          _axonHubData: undefined,
        },
      ],
      total: 1,
      type_counts: { openai: 1 },
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.list(config),
    ).rejects.toThrow("AxonHub channel row is missing native channel detail")
  })

  it("does not write masked AxonHub credentials back as real secrets", async () => {
    const native = buildAxonHubChannel({
      credentials: {
        apiKeys: ["sk-********"],
      },
    })
    axonHubApi.getAxonHubChannel.mockResolvedValue(native)
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(
      config,
      detail,
      resources.drafts.prepareEditDraft(detail),
    )

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.not.objectContaining({
        credentials: expect.anything(),
      }),
    )
  })

  it("creates and deletes resources through AxonHub GraphQL-native ids", async () => {
    const created = buildAxonHubChannel({
      id: "gid://axonhub/Channel/created-string-id",
      name: "Created Axon",
    })
    axonHubApi.createAxonHubChannel.mockResolvedValue(created)
    axonHubApi.deleteAxonHubChannel.mockResolvedValue(true)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(created),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!

    await expect(
      resources.items.create(config, {
        name: "Created Axon",
        type: "openai",
        key: "sk-created",
        base_url: "https://created.example.invalid/v1",
        models: ["gpt-4o"],
        groups: [],
        priority: 0,
        weight: 5,
        status: CHANNEL_STATUS.Enable,
      }),
    ).resolves.toEqual({
      outcome: "succeeded",
      confirmedEffects: [
        { kind: "resource-created", resourceKind: "channel" },
        {
          kind: "status-updated",
          resourceKind: "channel",
          resourceId: "gid://axonhub/Channel/created-string-id",
        },
      ],
      data: expect.objectContaining({
        ref: expect.objectContaining({
          resourceId: "gid://axonhub/Channel/created-string-id",
        }),
      }),
    })
    expect(axonHubApi.createAxonHubChannel).toHaveBeenCalledWith(config, {
      type: "openai",
      name: "Created Axon",
      baseURL: "https://created.example.invalid/v1",
      credentials: { apiKeys: ["sk-created"] },
      supportedModels: ["gpt-4o"],
      manualModels: ["gpt-4o"],
      defaultTestModel: "gpt-4o",
      settings: {},
      orderingWeight: 5,
    })

    await expect(
      resources.items.delete(config, {
        managedSiteType: SITE_TYPES.AXON_HUB,
        scopeKey: "https://axonhub.example.invalid",
        resourceId: "gid://axonhub/Channel/created-string-id",
      }),
    ).resolves.toEqual({
      outcome: "succeeded",
      data: undefined,
      confirmedEffects: [
        {
          kind: "resource-deleted",
          resourceKind: "channel",
          resourceId: "gid://axonhub/Channel/created-string-id",
        },
      ],
    })
    expect(axonHubApi.deleteAxonHubChannel).toHaveBeenCalledWith(
      config,
      "gid://axonhub/Channel/created-string-id",
    )
  })
})

const buildAxonHubChannel = (
  overrides: Partial<AxonHubChannel> = {},
): AxonHubChannel => ({
  id: "gid://axonhub/Channel/native-string-id",
  name: "Axon Native",
  type: "openai",
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  baseURL: "https://upstream.example.invalid/v1",
  credentials: {
    apiKeys: ["sk-live"],
  },
  supportedModels: ["gpt-4o"],
  manualModels: ["gpt-4o"],
  defaultTestModel: "gpt-4o",
  settings: {},
  orderingWeight: 0,
  remark: null,
  ...overrides,
})

const buildAxonHubChannelRow = (native: AxonHubChannel) => ({
  id: 408,
  name: native.name,
  type: native.type,
  key:
    native.credentials?.apiKeys?.find((key) => key.trim()) ??
    native.credentials?.apiKey ??
    "",
  base_url: native.baseURL,
  models: [...(native.supportedModels ?? []), ...(native.manualModels ?? [])]
    .filter(Boolean)
    .join(","),
  status:
    native.status === AXON_HUB_CHANNEL_STATUS.ENABLED
      ? CHANNEL_STATUS.Enable
      : CHANNEL_STATUS.ManuallyDisabled,
  priority: 0,
  weight: native.orderingWeight ?? 0,
  group: "",
  _axonHubData: native,
})
