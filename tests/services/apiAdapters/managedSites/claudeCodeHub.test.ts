import { beforeEach, describe, expect, it, vi } from "vitest"

import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import { toPrivateManagedSiteMutationOutput } from "~/services/managedSites/mutations"
import { CHANNEL_STATUS } from "~/types/managedSite"
import {
  CHANNEL_MUTATION_SCENARIOS,
  testManagedSiteChannelMutationContract,
  type ChannelMutationScenario,
} from "~~/tests/services/apiAdapters/managedSites/channelMutationContract"
import { testManagedUpstreamResourceMutationContract } from "~~/tests/services/apiAdapters/managedSites/resourceMutationContract"

const claudeCodeHubProvider = vi.hoisted(() => ({
  checkValidClaudeCodeHubConfig: vi.fn(),
  listChannels: vi.fn(),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  hydrateComparableChannelKeys: vi.fn(),
  buildClaudeCodeHubCreatePayloadFromFormData: vi.fn((draft) => ({
    name: draft.name.trim(),
    url: draft.base_url.trim(),
    key: draft.key.trim(),
    provider_type: draft.type,
    allowed_models: draft.models.map((model: string) => ({
      matchType: "exact",
      pattern: model,
    })),
    is_enabled: draft.status === 1,
    weight: draft.weight,
    priority: draft.priority,
    group_tag: draft.groups[0],
  })),
  buildClaudeCodeHubUpdatePayloadFromChannelData: vi.fn((channel) => ({
    providerId: channel.id,
    ...(channel.name === undefined ? {} : { name: channel.name.trim() }),
  })),
  providerToManagedSiteChannel: vi.fn((provider) => ({
    id: provider.id,
    type: provider.providerType,
    key: provider.maskedKey ?? provider.key ?? "",
    name: provider.name,
    base_url: provider.url,
    models:
      provider.allowedModels
        ?.map((item: any) =>
          typeof item === "string"
            ? item
            : item?.matchType === "exact"
              ? item.pattern
              : "",
        )
        .filter(Boolean)
        .join(",") ?? "",
    group: provider.groupTag ?? "default",
    status: provider.isEnabled === false ? 2 : 1,
    weight: provider.weight ?? 1,
    priority: provider.priority ?? 0,
  })),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
  toClaudeCodeHubDisclosureError: vi.fn(
    (error, config) =>
      new Error(
        error instanceof Error
          ? error.message.replaceAll(config.adminToken, "[REDACTED]")
          : "Claude Code Hub request failed",
      ),
  ),
}))

const claudeCodeHubApi = vi.hoisted(() => {
  class ClaudeCodeHubApiError extends Error {
    override readonly name = "ClaudeCodeHubApiError"

    constructor(
      message: string,
      readonly status: number | undefined,
      readonly evidence: {
        dispatch: "not-dispatched" | "dispatched"
        responseReceived: boolean
        confirmedNonApplication: boolean
        raw?: unknown
      },
    ) {
      super(message)
    }

    get dispatch() {
      return this.evidence.dispatch
    }

    get responseReceived() {
      return this.evidence.responseReceived
    }

    get confirmedNonApplication() {
      return this.evidence.confirmedNonApplication
    }

    get raw() {
      return this.evidence.raw
    }

    get code() {
      const raw = this.evidence.raw
      return typeof raw === "object" && raw !== null && "code" in raw
        ? raw.code
        : undefined
    }
  }

  return {
    ClaudeCodeHubApiError,
    listProviders: vi.fn(),
    searchProviders: vi.fn(),
    createProvider: vi.fn(),
    updateProvider: vi.fn(),
    deleteProvider: vi.fn(),
    getUnmaskedProviderKey: vi.fn(),
  }
})

vi.mock("~/services/managedSites/providers/claudeCodeHub", () => ({
  ...claudeCodeHubProvider,
}))

vi.mock("~/services/apiService/claudeCodeHub", () => ({
  ...claudeCodeHubApi,
}))

describe("Claude Code Hub managed-site channel capability", () => {
  const config = {
    baseUrl: "https://claude-code-hub.example.invalid",
    adminToken: "admin-token",
  }

  const arrangeNativeMutation =
    (mock: typeof claudeCodeHubApi.createProvider, successData: unknown) =>
    (scenario: ChannelMutationScenario) => {
      const original =
        scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation
          ? new DOMException("cancelled", "AbortError")
          : new TypeError("Failed to fetch")
      const raw =
        scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation
          ? new claudeCodeHubApi.ClaudeCodeHubApiError("cancelled", undefined, {
              dispatch: "not-dispatched",
              responseReceived: false,
              confirmedNonApplication: true,
              raw: original,
            })
          : new claudeCodeHubApi.ClaudeCodeHubApiError(
              "Failed to fetch",
              undefined,
              {
                dispatch: "dispatched",
                responseReceived: false,
                confirmedNonApplication: false,
                raw: original,
              },
            )
      const rejectionResponse = new claudeCodeHubApi.ClaudeCodeHubApiError(
        "provider rejected",
        403,
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
        },
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
        expectedRejectedDiagnostic: {
          message: "provider rejected",
          statusCode: 403,
          raw: rejectionResponse,
        },
      }
    }

  it.each([
    ["create", claudeCodeHubApi.createProvider],
    ["update", claudeCodeHubApi.updateProvider],
    ["delete", claudeCodeHubApi.deleteProvider],
  ] as const)("rethrows unknown %s programming errors", async (name, mock) => {
    const programmingError = { name, invariant: "broken" }
    mock.mockRejectedValueOnce(programmingError)
    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    const mutation =
      name === "create"
        ? claudeCodeHubManagedSiteChannels.create(config, {
            mode: "single",
            channel: { name: "provider", status: 1 },
          })
        : name === "update"
          ? claudeCodeHubManagedSiteChannels.update(config, {
              id: 7,
              name: "updated",
            })
          : claudeCodeHubManagedSiteChannels.delete(config, 7)

    await expect(mutation).rejects.toBe(programmingError)
  })

  const createPayload = {
    mode: "single",
    channel: {
      name: "provider",
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      key: "sk-example",
      base_url: "https://upstream.example.invalid/v1",
      models: "claude-example",
      groups: ["default"] as string[],
      status: 1,
      weight: 2,
      priority: 3,
    },
  } as const

  testManagedSiteChannelMutationContract([
    {
      name: "create",
      effect: { kind: "resource-created", resourceKind: "channel" },
      successData: { id: 17 },
      arrange: arrangeNativeMutation(claudeCodeHubApi.createProvider, {
        id: 17,
      }),
      invoke: async () => {
        const { claudeCodeHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/claudeCodeHub"
        )
        return await claudeCodeHubManagedSiteChannels.create(
          config,
          createPayload,
        )
      },
      assertRequestPayload: () =>
        expect(claudeCodeHubApi.createProvider.mock.calls.at(-1)?.[1]).toEqual({
          name: "provider",
          url: "https://upstream.example.invalid/v1",
          key: "sk-example",
          provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
          allowed_models: [{ matchType: "exact", pattern: "claude-example" }],
          is_enabled: true,
          weight: 2,
          priority: 3,
          group_tag: "default",
        }),
    },
    {
      name: "update",
      effect: {
        kind: "resource-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: { id: 7 },
      arrange: arrangeNativeMutation(claudeCodeHubApi.updateProvider, {
        id: 7,
      }),
      invoke: async () => {
        const { claudeCodeHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/claudeCodeHub"
        )
        return await claudeCodeHubManagedSiteChannels.update(config, {
          id: 7,
          name: "updated",
        })
      },
      assertRequestPayload: () =>
        expect(claudeCodeHubApi.updateProvider.mock.calls.at(-1)?.[1]).toEqual({
          providerId: 7,
          name: "updated",
        }),
    },
    {
      name: "delete",
      effect: {
        kind: "resource-deleted",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeNativeMutation(claudeCodeHubApi.deleteProvider, true),
      invoke: async () => {
        const { claudeCodeHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/claudeCodeHub"
        )
        return await claudeCodeHubManagedSiteChannels.delete(config, 7)
      },
      assertRequestPayload: () =>
        expect(claudeCodeHubApi.deleteProvider.mock.calls.at(-1)?.[1]).toBe(7),
    },
  ])

  it.each([403, 599])(
    "retains valid Claude Code Hub status %s as a diagnostic only",
    async (status) => {
      const error = new claudeCodeHubApi.ClaudeCodeHubApiError(
        "provider rejected",
        status,
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
        },
      )
      claudeCodeHubApi.deleteProvider.mockRejectedValueOnce(error)
      const { claudeCodeHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/claudeCodeHub"
      )

      await expect(
        claudeCodeHubManagedSiteChannels.delete(config, 7),
      ).resolves.toEqual({
        outcome: "rejected",
        diagnostic: {
          message: "provider rejected",
          statusCode: status,
          raw: error,
        },
      })
    },
  )

  it("redacts Claude Code Hub mutation diagnostics only at disclosure", async () => {
    const error = new claudeCodeHubApi.ClaudeCodeHubApiError(
      "token admin-token rejected",
      403,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        raw: { token: "admin-token" },
      },
    )
    claudeCodeHubApi.deleteProvider.mockRejectedValueOnce(error)
    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    const mutation = await claudeCodeHubManagedSiteChannels.delete(config, 7)
    expect(mutation).toMatchObject({
      outcome: "rejected",
      diagnostic: { message: "token admin-token rejected", raw: error },
    })

    const disclosed = toPrivateManagedSiteMutationOutput(mutation, {
      knownSecrets: [config.adminToken],
    })
    expect(disclosed).toEqual({
      outcome: "rejected",
      statusCode: 403,
      message: "token [REDACTED] rejected",
    })
    expect(disclosed).not.toHaveProperty("raw")
  })

  it.each([99, 600, Number.NaN])(
    "ignores invalid Claude Code Hub status %s without changing certainty",
    async (status) => {
      const error = new claudeCodeHubApi.ClaudeCodeHubApiError(
        "provider rejected",
        status,
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
        },
      )
      claudeCodeHubApi.deleteProvider.mockRejectedValueOnce(error)
      const { claudeCodeHubManagedSiteChannels } = await import(
        "~/services/apiAdapters/managedSites/claudeCodeHub"
      )

      await expect(
        claudeCodeHubManagedSiteChannels.delete(config, 7),
      ).resolves.toEqual({
        outcome: "rejected",
        diagnostic: { message: "provider rejected", raw: error },
      })
    },
  )

  it("uses the generic Claude Code Hub diagnostic when an API error message is empty", async () => {
    const error = new claudeCodeHubApi.ClaudeCodeHubApiError("", undefined, {
      dispatch: "dispatched",
      responseReceived: false,
      confirmedNonApplication: false,
    })
    claudeCodeHubApi.deleteProvider.mockRejectedValueOnce(error)
    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    await expect(
      claudeCodeHubManagedSiteChannels.delete(config, 7),
    ).resolves.toEqual({
      outcome: "uncertain",
      diagnostic: {
        message: "Claude Code Hub mutation failed",
        raw: error,
      },
    })
  })
  const provider = {
    id: 7,
    name: "Claude Provider",
    url: "https://provider.example.invalid/v1",
    maskedKey: "sk-********",
    isEnabled: false,
    weight: 4,
    priority: 9,
    groupTag: "vip",
    providerType: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
    allowedModels: [
      { matchType: "prefix", pattern: "claude-" },
      { matchType: "exact", pattern: "claude-3-5-sonnet" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    providerOnlyFlag: true,
  }

  const resourceDraft = {
    name: "Claude Resource Edited",
    type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
    key: "sk-resource",
    base_url: "https://resource.example.invalid/v1",
    models: ["claude-example"],
    groups: ["default"],
    priority: 2,
    weight: 3,
    status: CHANNEL_STATUS.Enable,
  }
  const resourceDetail = {
    summary: {
      ref: {
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        scopeKey: "https://claude-code-hub.example.invalid",
        resourceId: String(provider.id),
      },
      displayName: provider.name,
      nativeKind: "provider",
      status: "disabled",
      secretState: "masked",
      capabilities: { canUpdate: true },
    },
    native: provider,
  } as const

  testManagedUpstreamResourceMutationContract([
    {
      name: "create",
      effect: { kind: "resource-created", resourceKind: "channel" },
      successData: expect.objectContaining({
        displayName: provider.name,
        nativeKind: "provider",
      }),
      arrange: arrangeNativeMutation(claudeCodeHubApi.createProvider, provider),
      invoke: async () => {
        const { claudeCodeHubManagedSiteCapabilities } = await import(
          "~/services/apiAdapters/managedSites/claudeCodeHub"
        )
        return await claudeCodeHubManagedSiteCapabilities.resources!.items.create(
          config,
          { ...resourceDraft, name: provider.name },
        )
      },
      assertRequestPayload: () =>
        expect(claudeCodeHubApi.createProvider.mock.calls.at(-1)?.[1]).toEqual(
          expect.objectContaining({
            name: provider.name,
            allowed_models: [{ matchType: "exact", pattern: "claude-example" }],
          }),
        ),
    },
    {
      name: "update",
      effect: {
        kind: "resource-updated",
        resourceKind: "channel",
        resourceId: provider.id,
      },
      successData: expect.objectContaining({
        displayName: provider.name,
        nativeKind: "provider",
      }),
      arrange: arrangeNativeMutation(claudeCodeHubApi.updateProvider, provider),
      invoke: async () => {
        const { claudeCodeHubManagedSiteCapabilities } = await import(
          "~/services/apiAdapters/managedSites/claudeCodeHub"
        )
        return await claudeCodeHubManagedSiteCapabilities.resources!.items.update(
          config,
          resourceDetail,
          { ...resourceDraft, name: provider.name },
        )
      },
      assertRequestPayload: () =>
        expect(claudeCodeHubApi.updateProvider.mock.calls.at(-1)?.[1]).toEqual(
          expect.objectContaining({
            id: provider.id,
            allowed_models: [
              { matchType: "prefix", pattern: "claude-" },
              { matchType: "exact", pattern: "claude-example" },
            ],
            providerOnlyFlag: true,
          }),
        ),
    },
    {
      name: "delete",
      effect: {
        kind: "resource-deleted",
        resourceKind: "channel",
        resourceId: provider.id,
      },
      successData: undefined,
      arrange: arrangeNativeMutation(claudeCodeHubApi.deleteProvider, true),
      invoke: async () => {
        const { claudeCodeHubManagedSiteCapabilities } = await import(
          "~/services/apiAdapters/managedSites/claudeCodeHub"
        )
        return await claudeCodeHubManagedSiteCapabilities.resources!.items.delete(
          config,
          resourceDetail.summary.ref,
        )
      },
      assertRequestPayload: () =>
        expect(claudeCodeHubApi.deleteProvider.mock.calls.at(-1)?.[1]).toBe(
          provider.id,
        ),
    },
  ])

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exposes secret-key and comparable-key hydration helpers", async () => {
    const listResponse = {
      items: [{ id: 1, name: "Claude Code Hub" }],
      total: 1,
      type_counts: { claude: 1 },
    }
    claudeCodeHubProvider.listChannels.mockResolvedValue(listResponse)
    claudeCodeHubProvider.fetchChannelSecretKey.mockResolvedValue("real-key")
    claudeCodeHubProvider.hydrateComparableChannelKeys.mockResolvedValue([
      { id: 1, key: "real-key" },
    ])

    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    await expect(claudeCodeHubManagedSiteChannels.list?.(config)).resolves.toBe(
      listResponse,
    )
    await expect(
      claudeCodeHubManagedSiteChannels.fetchSecretKey?.(config, 1),
    ).resolves.toBe("real-key")
    await expect(
      claudeCodeHubManagedSiteChannels.hydrateComparableKeys?.(config, [
        { id: 1, key: "masked" } as never,
      ]),
    ).resolves.toEqual([{ id: 1, key: "real-key" }])
  })

  it("does not expose model-sync methods", async () => {
    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    expect(claudeCodeHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(claudeCodeHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(claudeCodeHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("exposes provider config and draft functions", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    expect(claudeCodeHubManagedSiteCapabilities.config.checkValid).toBe(
      claudeCodeHubProvider.checkValidClaudeCodeHubConfig,
    )
    expect(claudeCodeHubManagedSiteCapabilities.resources).toEqual({
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
    expect(claudeCodeHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: claudeCodeHubProvider.fetchAvailableModels,
      buildName: claudeCodeHubProvider.buildChannelName,
      prepareFormData: claudeCodeHubProvider.prepareChannelFormData,
      buildPayload: claudeCodeHubProvider.buildChannelPayload,
    })
    expect(claudeCodeHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("maps native Claude Code Hub providers to internal resource summaries", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.listProviders.mockResolvedValue([provider])
    claudeCodeHubApi.searchProviders.mockResolvedValue([
      {
        ...provider,
        id: 8,
        name: "Enabled Provider",
        maskedKey: undefined,
        key: "sk-live-provider-key",
        isEnabled: true,
      },
    ])

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.list(config),
    ).resolves.toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Claude Provider",
          nativeKind: "provider",
          status: "disabled",
          typeLabel: "Claude (Anthropic Messages API)",
          endpointLabel: "https://provider.example.invalid/v1",
          modelCount: 1,
          modelPreview: ["claude-3-5-sonnet"],
          secretState: "masked",
          capabilities: {
            canCreate: true,
            canUpdate: true,
            canDelete: true,
            canRevealSecret: true,
          },
          ref: {
            managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
            scopeKey: "https://claude-code-hub.example.invalid",
            resourceId: "7",
          },
        }),
      ],
    })

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.search(
        config,
        "enabled",
      ),
    ).resolves.toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Enabled Provider",
          status: "enabled",
          secretState: "available",
          ref: {
            managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
            scopeKey: "https://claude-code-hub.example.invalid",
            resourceId: "8",
          },
        }),
      ],
    })
  })

  it.each([
    {
      name: "list",
      reject: claudeCodeHubApi.listProviders,
      invoke: async (capabilities: any) =>
        await capabilities.resources.items.list(config),
    },
    {
      name: "search",
      reject: claudeCodeHubApi.searchProviders,
      invoke: async (capabilities: any) =>
        await capabilities.resources.items.search(config, "provider"),
    },
    {
      name: "reveal",
      reject: claudeCodeHubApi.getUnmaskedProviderKey,
      invoke: async (capabilities: any) =>
        await capabilities.resources.secrets.revealSecret(config, {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        }),
    },
  ])("sanitizes direct resource $name failures", async ({ reject, invoke }) => {
    const raw = Object.assign(new Error("token admin-token rejected"), {
      raw: { token: "admin-token" },
      cause: new Error("admin-token"),
    })
    reject.mockRejectedValueOnce(raw)
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    const failure = await invoke(claudeCodeHubManagedSiteCapabilities).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe("token [REDACTED] rejected")
    expect(failure).not.toHaveProperty("raw")
    expect(failure).not.toHaveProperty("cause")
    expect(Object.keys(failure as object)).toEqual([])
    expect(
      claudeCodeHubProvider.toClaudeCodeHubDisclosureError,
    ).toHaveBeenCalledWith(raw, config)
  })

  it("maps Claude Code Hub fallback labels and secret states", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.listProviders.mockResolvedValue([
      {
        ...provider,
        id: 10,
        name: "",
        url: undefined,
        maskedKey: undefined,
        key: "",
        providerType: "custom_native",
        allowedModels: ["claude-3-opus", "claude-3-haiku"],
        isEnabled: true,
      },
    ])

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.list(config),
    ).resolves.toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Provider 10",
          status: "enabled",
          typeLabel: "custom_native",
          endpointLabel: "",
          modelCount: 2,
          modelPreview: ["claude-3-opus", "claude-3-haiku"],
          secretState: "unavailable",
        }),
      ],
    })
  })

  it("reveals Claude Code Hub provider secrets through resource capabilities", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.getUnmaskedProviderKey.mockResolvedValue(
      "  sk-revealed-provider-key  ",
    )

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.secrets?.revealSecret(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      ),
    ).resolves.toEqual({
      status: "available",
      secret: "sk-revealed-provider-key",
    })
    expect(claudeCodeHubApi.getUnmaskedProviderKey).toHaveBeenCalledWith(
      config,
      7,
    )
  })

  it("returns masked and unavailable Claude Code Hub secret reveal states", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.getUnmaskedProviderKey
      .mockResolvedValueOnce("sk-********")
      .mockResolvedValueOnce("")

    const ref = {
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      scopeKey: "https://claude-code-hub.example.invalid",
      resourceId: "7",
    }

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.secrets?.revealSecret(
        config,
        ref,
      ),
    ).resolves.toEqual({ status: "masked" })
    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.secrets?.revealSecret(
        config,
        ref,
      ),
    ).resolves.toEqual({ status: "unavailable" })
  })

  it("uses channel wording when resource detail cannot find a provider", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.listProviders.mockResolvedValue([])

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        scopeKey: "https://claude-code-hub.example.invalid",
        resourceId: "404",
      }),
    ).rejects.toThrow("Channel was not found")
  })

  it("creates Claude Code Hub resources through the provider API payload", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const createdProvider = {
      ...provider,
      id: 9,
      name: "Created Claude Provider",
      key: "sk-created-provider-key",
      maskedKey: undefined,
      isEnabled: true,
    }
    claudeCodeHubApi.createProvider.mockResolvedValue(createdProvider)

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.create(config, {
        name: "Created Claude Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        key: "sk-created-provider-key",
        base_url: "https://created-provider.example.invalid/v1",
        models: ["claude-3-5-sonnet"],
        groups: ["vip"],
        priority: 2,
        weight: 5,
        status: 1,
      }),
    ).resolves.toEqual({
      outcome: "succeeded",
      confirmedEffects: [{ kind: "resource-created", resourceKind: "channel" }],
      data: expect.objectContaining({
        displayName: "Created Claude Provider",
        nativeKind: "provider",
        status: "enabled",
        secretState: "available",
        ref: {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "9",
        },
      }),
    })
    expect(
      claudeCodeHubProvider.buildClaudeCodeHubCreatePayloadFromFormData,
    ).toHaveBeenCalledWith({
      name: "Created Claude Provider",
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      key: "sk-created-provider-key",
      base_url: "https://created-provider.example.invalid/v1",
      models: ["claude-3-5-sonnet"],
      groups: ["vip"],
      priority: 2,
      weight: 5,
      status: 1,
    })
    expect(claudeCodeHubApi.createProvider).toHaveBeenCalledWith(config, {
      name: "Created Claude Provider",
      url: "https://created-provider.example.invalid/v1",
      key: "sk-created-provider-key",
      provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      allowed_models: [{ matchType: "exact", pattern: "claude-3-5-sonnet" }],
      is_enabled: true,
      weight: 5,
      priority: 2,
      group_tag: "vip",
    })
  })

  it("deletes Claude Code Hub resources by provider id with normalized responses", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.deleteProvider.mockResolvedValue(undefined)

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.delete(config, {
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        scopeKey: "https://claude-code-hub.example.invalid",
        resourceId: "7",
      }),
    ).resolves.toEqual({
      outcome: "succeeded",
      data: undefined,
      confirmedEffects: [
        {
          kind: "resource-deleted",
          resourceKind: "channel",
          resourceId: 7,
        },
      ],
    })
    expect(claudeCodeHubApi.deleteProvider).toHaveBeenCalledWith(config, 7)
  })

  it("returns empty Claude Code Hub resource search results and null mutation summaries", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.searchProviders.mockResolvedValue([])
    claudeCodeHubApi.createProvider.mockResolvedValue({ id: "not-native" })
    claudeCodeHubApi.updateProvider.mockResolvedValue({ id: "not-native" })

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.search(
        config,
        "missing",
      ),
    ).resolves.toEqual({
      total: 0,
      items: [],
    })
    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.create(config, {
        name: "Created Claude Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        key: "sk-created-provider-key",
        base_url: "https://created-provider.example.invalid/v1",
        models: ["claude-3-5-sonnet"],
        groups: ["vip"],
        priority: 2,
        weight: 5,
        status: 1,
      }),
    ).resolves.toEqual({
      outcome: "succeeded",
      confirmedEffects: [{ kind: "resource-created", resourceKind: "channel" }],
      data: null,
    })
    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.update(
        config,
        resourceDetail,
        resourceDraft,
      ),
    ).resolves.toEqual({
      outcome: "succeeded",
      confirmedEffects: [
        {
          kind: "resource-updated",
          resourceKind: "channel",
          resourceId: provider.id,
        },
      ],
      data: null,
    })
  })

  it("preserves native provider fields through resource edits while omitting masked keys", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.listProviders.mockResolvedValue([provider])
    claudeCodeHubApi.updateProvider.mockResolvedValue({
      ...provider,
      name: "Edited Claude Provider",
      url: "https://edited-provider.example.invalid/v1",
      weight: 5,
      priority: 2,
    })

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )
    const draft =
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(
        detail,
      )

    expect(detail.native).toEqual(provider)
    expect(draft).toEqual({
      name: "Claude Provider",
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      key: "sk-********",
      base_url: "https://provider.example.invalid/v1",
      models: ["claude-3-5-sonnet"],
      groups: ["vip"],
      priority: 9,
      weight: 4,
      status: 2,
      _claudeCodeHubNativeAllowedModels: provider.allowedModels,
    })

    await claudeCodeHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        ...draft,
        name: "Edited Claude Provider",
        base_url: "https://edited-provider.example.invalid/v1",
        weight: 5,
        priority: 2,
      },
    )

    expect(claudeCodeHubApi.updateProvider).toHaveBeenCalledWith(config, {
      ...provider,
      providerId: 7,
      name: "Edited Claude Provider",
      url: "https://edited-provider.example.invalid/v1",
      provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      allowed_models: provider.allowedModels,
      is_enabled: false,
      weight: 5,
      priority: 2,
      group_tag: "vip",
    })
    expect(
      claudeCodeHubApi.updateProvider.mock.calls.at(-1)?.[1],
    ).not.toHaveProperty("key")
  })

  it("normalizes Claude Code Hub resource edit payload fallbacks", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.listProviders.mockResolvedValue([provider])
    claudeCodeHubApi.updateProvider.mockResolvedValue(provider)

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )

    await claudeCodeHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        name: " Edited Claude Provider ",
        type: "",
        key: " sk-new-provider-key ",
        base_url: " https://edited-provider.example.invalid/v1 ",
        models: ["claude-3-7-sonnet"],
        groups: [],
        priority: 0,
        weight: Number.NaN,
        status: 1,
      },
    )

    expect(claudeCodeHubApi.updateProvider).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        providerId: 7,
        name: "Edited Claude Provider",
        key: "sk-new-provider-key",
        url: "https://edited-provider.example.invalid/v1",
        provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        allowed_models: [
          { matchType: "prefix", pattern: "claude-" },
          { matchType: "exact", pattern: "claude-3-7-sonnet" },
        ],
        is_enabled: true,
        weight: 1,
        group_tag: "default",
      }),
    )
  })

  it("allows ordinary edits for prefix-only model rules while preserving native allowed models", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const prefixOnlyProvider = {
      ...provider,
      allowedModels: [{ matchType: "prefix", pattern: "claude-" }],
    }
    claudeCodeHubApi.listProviders.mockResolvedValue([prefixOnlyProvider])
    claudeCodeHubApi.updateProvider.mockResolvedValue(prefixOnlyProvider)

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )
    const draft =
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(
        detail,
      )

    expect(draft.models).toEqual([])
    expect(
      claudeCodeHubManagedSiteCapabilities.resources.drafts.validateDraft(
        draft,
      ),
    ).toEqual({ valid: true, errors: [] })

    await claudeCodeHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        ...draft,
        name: "Edited Prefix Provider",
      },
    )

    expect(claudeCodeHubApi.updateProvider).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        providerId: 7,
        name: "Edited Prefix Provider",
        allowed_models: prefixOnlyProvider.allowedModels,
        providerOnlyFlag: true,
      }),
    )
    expect(
      claudeCodeHubApi.updateProvider.mock.calls.at(-1)?.[1],
    ).not.toHaveProperty("key")
  })

  it("prepares and validates Claude Code Hub resource import drafts", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const sourceDraft = {
      name: "Source Claude Provider",
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      key: "sk-source",
      base_url: "https://source.example.invalid/v1",
      models: ["claude-3-5-sonnet"],
      groups: ["vip"],
      priority: 3,
      weight: 4,
      status: CHANNEL_STATUS.Enable,
    }

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareImportDraft({
        source: sourceDraft,
      }),
    ).resolves.toBe(sourceDraft)
    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareImportDraft({
        resource: {
          ref: {
            managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
            scopeKey: "https://claude-code-hub.example.invalid",
            resourceId: "10",
          },
          displayName: "Imported Claude Provider",
          nativeKind: "provider",
          status: "enabled",
          endpointLabel: "https://imported.example.invalid/v1",
          modelPreview: ["claude-3-5-sonnet"],
          secretState: "masked",
          capabilities: {},
        },
      }),
    ).resolves.toEqual({
      name: "Imported Claude Provider",
      type: "",
      key: "",
      base_url: "https://imported.example.invalid/v1",
      models: ["claude-3-5-sonnet"],
      groups: ["default"],
      priority: 0,
      weight: 1,
      status: CHANNEL_STATUS.Enable,
    })

    expect(
      claudeCodeHubManagedSiteCapabilities.resources.drafts.validateDraft({
        ...sourceDraft,
        name: " ",
        base_url: "",
        models: [],
      }),
    ).toEqual({
      valid: false,
      errors: [
        { field: "name", message: "Channel name is required" },
        { field: "base_url", message: "Base URL is required" },
        { field: "models", message: "At least one model is required" },
      ],
    })
  })

  it("preserves non-exact native model rules when exact models are edited", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const mixedRuleProvider = {
      ...provider,
      allowedModels: [
        { matchType: "prefix", pattern: "claude-" },
        { matchType: "exact", pattern: "claude-3-5-sonnet" },
      ],
    }
    claudeCodeHubApi.listProviders.mockResolvedValue([mixedRuleProvider])
    claudeCodeHubApi.updateProvider.mockResolvedValue(mixedRuleProvider)

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )
    const draft =
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(
        detail,
      )

    await claudeCodeHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        ...draft,
        models: ["claude-3-7-sonnet"],
      },
    )

    expect(claudeCodeHubApi.updateProvider).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        allowed_models: [
          { matchType: "prefix", pattern: "claude-" },
          { matchType: "exact", pattern: "claude-3-7-sonnet" },
        ],
      }),
    )
  })

  it("blocks clearing exact model rules instead of silently preserving old allowed models", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const exactModelProvider = {
      ...provider,
      allowedModels: ["claude-3-5-sonnet"],
    }
    claudeCodeHubApi.listProviders.mockResolvedValue([exactModelProvider])

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )
    const draft =
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(
        detail,
      )

    expect(draft.models).toEqual(["claude-3-5-sonnet"])
    expect(
      claudeCodeHubManagedSiteCapabilities.resources.drafts.validateDraft({
        ...draft,
        models: [],
      }),
    ).toEqual({
      valid: false,
      errors: [
        {
          field: "models",
          message: "At least one model is required",
        },
      ],
    })
  })
})
