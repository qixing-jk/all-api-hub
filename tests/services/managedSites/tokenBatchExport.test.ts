import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import type { ManagedSiteService } from "~/services/managedSites/managedSiteService"
import { MANAGED_UPSTREAM_RESOURCE_FEATURES } from "~/services/managedSites/managedUpstreamResourceMigration"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type { AccountToken } from "~/types"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
} from "~/types/managedSiteTokenBatchExport"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildManagedSiteChannel,
} from "~~/tests/test-utils/factories"

const {
  mockResolveDisplayAccountRuntimeKeySecret,
  mockGetManagedSiteService,
  mockGetManagedSiteServiceForType,
  mockGetCurrentManagedSiteRuntimeConfig,
  mockResolveManagedSiteChannelMatch,
  mockResolveManagedUpstreamResourceFeatureCapabilities,
  buildChannelMatchRequestCache,
} = vi.hoisted(() => ({
  mockResolveDisplayAccountRuntimeKeySecret: vi.fn(),
  mockGetManagedSiteService: vi.fn(),
  mockGetManagedSiteServiceForType: vi.fn(),
  mockGetCurrentManagedSiteRuntimeConfig: vi.fn(),
  mockResolveManagedSiteChannelMatch: vi.fn(),
  mockResolveManagedUpstreamResourceFeatureCapabilities: vi.fn(),
  buildChannelMatchRequestCache: () => ({
    searchResultsByBaseUrl: new Map(),
    channelSecretKeysById: new Map(),
    resolvedChannelKeysById: {},
  }),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret:
    mockResolveDisplayAccountRuntimeKeySecret,
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: mockGetManagedSiteService,
  getManagedSiteServiceForType: mockGetManagedSiteServiceForType,
}))

vi.mock("~/services/managedSites/runtimeConfig", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentManagedSiteRuntimeConfig: mockGetCurrentManagedSiteRuntimeConfig,
}))

vi.mock("~/services/managedSites/channelMatchResolver", () => ({
  createManagedSiteChannelMatchRequestCache: buildChannelMatchRequestCache,
  resolveManagedSiteChannelMatch: mockResolveManagedSiteChannelMatch,
}))

vi.mock("~/services/managedSites/managedUpstreamResourceService", () => ({
  resolveManagedUpstreamResourceFeatureCapabilities:
    mockResolveManagedUpstreamResourceFeatureCapabilities,
}))

const buildAccountToken = (
  overrides: Partial<AccountToken> = {},
): AccountToken => ({
  ...buildApiToken({
    id: 11,
    name: "Token 11",
    key: "token-secret",
  }),
  accountId: "account-1",
  accountName: "Account 1",
  ...overrides,
})

const buildAccountTokenInput = (
  account = buildDisplaySiteData(),
  token = buildAccountToken(),
) => ({
  account,
  runtimeKey: buildAccountTokenRuntimeKey(account, token),
})

const sessionResyncExecution = {
  version: 2 as const,
  kind: "automatic" as const,
  feature: "managed_site_channels" as const,
  trigger: "background_recovery" as const,
  surface: "background" as const,
}

const sessionResyncOptions = {
  protectionBypassExecution: sessionResyncExecution,
}

const buildMatchInspection = (overrides: Record<string, any> = {}) => ({
  searchBaseUrl: "https://upstream.example.com",
  searchCompleted: true,
  url: {
    matched: false,
    channel: null,
    candidateCount: 0,
  },
  key: {
    comparable: true,
    matched: false,
    reason: "no-match",
    channel: null,
  },
  models: {
    comparable: true,
    matched: false,
    reason: "no-match",
    channel: null,
  },
  ...overrides,
})

const buildService = (
  overrides: Partial<ManagedSiteService> = {},
): ManagedSiteService =>
  ({
    siteType: SITE_TYPES.NEW_API,
    messagesKey: "newapi",
    getConfig: vi.fn().mockResolvedValue({
      baseUrl: "https://target.example.com",
      adminToken: "admin-token",
      userId: "1",
    }),
    prepareChannelFormData: vi.fn(async (account, token) => ({
      name: `${account.name} - ${token.name}`,
      type: 1,
      key: token.key,
      base_url: account.baseUrl,
      models: ["gpt-4o"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 1,
    })),
    buildChannelPayload: vi.fn((draft) => ({
      mode: "single",
      channel: {
        name: draft.name,
        key: draft.key,
        models: draft.models.join(","),
        groups: draft.groups,
        group: draft.groups.join(","),
        status: draft.status,
      },
    })),
    createChannel: vi.fn().mockResolvedValue({
      outcome: "succeeded",
      data: null,
      confirmedEffects: [
        { kind: "resource-created", resourceKind: "channel", resourceId: 7 },
      ],
      message: "ok",
    }),
    searchChannel: vi.fn(),
    listChannels: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    }),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    checkValidConfig: vi.fn(),
    fetchSiteUserGroups: vi.fn().mockResolvedValue([]),
    fetchAccountAvailableModels: vi.fn().mockResolvedValue([]),
    fetchAvailableModels: vi.fn(),
    buildChannelName: vi.fn(),
    ...overrides,
  }) as ManagedSiteService

const buildRuntimeConfigForService = async (service: ManagedSiteService) => {
  const config = await service.getConfig()
  if (!config) return null

  if (service.siteType === SITE_TYPES.AXON_HUB) {
    return {
      siteType: service.siteType,
      config: {
        baseUrl: config.baseUrl,
        email: "admin@example.invalid",
        password: "placeholder-password",
      },
    }
  }

  if (service.siteType === SITE_TYPES.OCTOPUS) {
    return {
      siteType: service.siteType,
      config: {
        baseUrl: config.baseUrl,
        username: "admin",
        password: "placeholder-password",
      },
    }
  }

  return { siteType: service.siteType, config }
}

const useManagedSiteService = (service: ManagedSiteService) => {
  mockGetManagedSiteService.mockResolvedValue(service)
  mockGetManagedSiteServiceForType.mockReturnValue(service)
  mockGetCurrentManagedSiteRuntimeConfig.mockImplementation(() =>
    buildRuntimeConfigForService(service),
  )
}

const expectBatchDraftOptions = () =>
  expect.objectContaining({
    operationContext: expect.any(Object),
  })

const manualCompleteIntent = {
  source: "manual-selection",
  verification: "complete",
} as const

const repairTrustedNewIntent = {
  source: "repair-created",
  verification: "trusted-new",
} as const

const repairCompleteIntent = {
  source: "repair-created",
  verification: "complete",
} as const

describe("managed-site token batch export", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetCurrentManagedSiteRuntimeConfig.mockImplementation(async () => {
      const service = await mockGetManagedSiteService()
      mockGetManagedSiteServiceForType.mockReturnValue(service)
      return buildRuntimeConfigForService(service)
    })
    mockResolveDisplayAccountRuntimeKeySecret.mockImplementation(
      async (_account, runtimeKey) => runtimeKey,
    )
    mockResolveManagedSiteChannelMatch.mockResolvedValue(buildMatchInspection())
    mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
      (siteType: string, feature: string) => ({
        supported: false,
        siteType,
        feature,
        reason: "feature-slice-disabled",
      }),
    )
  })

  it("returns an empty preview when there are no selected tokens", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [],
    })

    expect(preview).toMatchObject({
      totalCount: 0,
      readyCount: 0,
      warningCount: 0,
      skippedCount: 0,
      blockedCount: 0,
      items: [],
    })
  })

  it("previews ready tokens and creates selected channels", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)
    mockGetManagedSiteServiceForType.mockReturnValue(service)

    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")

    const account = buildDisplaySiteData({
      id: "account-1",
      name: "Alpha",
      baseUrl: "https://upstream.example.com/",
    })
    const token = buildAccountToken()
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
      PROTECTION_BYPASS_SURFACES.Options,
    )
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput(account, token)],
      protectionBypassExecution,
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      accountName: "Alpha",
      runtimeKeyName: "Token 11",
    })
    expect(mockResolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledWith(
      account,
      expect.anything(),
      { protectionBypassExecution },
    )

    const result = await executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: [preview.items[0].id],
    })

    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
    })
    expect(result.items[0]).toMatchObject({ result: "created" })
    expect(service.createChannel).toHaveBeenCalledTimes(1)
    expect(service.createChannel).toHaveBeenCalledWith(
      {
        baseUrl: "https://target.example.com",
        adminToken: "admin-token",
        userId: "1",
      },
      expect.objectContaining({
        channel: expect.objectContaining({
          key: "token-secret",
        }),
      }),
    )
  })

  it("passes previously resolved channel keys into duplicate matching", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const input = buildAccountTokenInput()
    await prepareManagedSiteTokenBatchExportPreview({
      items: [input],
      resolvedChannelKeysByItemId: {
        [input.runtimeKey.id]: {
          77: "resolved-channel-key",
        },
      },
    })

    expect(mockResolveManagedSiteChannelMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedChannelKeysById: {
          77: "resolved-channel-key",
        },
      }),
    )
  })

  it("previews service credentials without resolving an account token secret", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      baseUrl: "https://sharedchat.example.invalid/",
    })
    const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex API Key",
        key: "sk-service-credential",
        baseUrl: "https://sharedchat.example.invalid/v1",
        isAuthenticated: true,
      },
    )
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [
        {
          account,
          runtimeKey: serviceCredentialRuntimeKey,
        },
      ],
    })

    expect(mockResolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
    expect(service.prepareChannelFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sharedchat-account",
        baseUrl: "https://sharedchat.example.invalid/v1",
      }),
      expect.objectContaining({
        id: -1,
        name: "Codex API Key",
        key: "sk-service-credential",
        accountId: "sharedchat-account",
      }),
      expectBatchDraftOptions(),
    )
    expect(preview.items[0]).toMatchObject({
      id: "service_credential:sharedchat-account:codex",
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      accountName: "SharedChat",
      runtimeKeyId: "service_credential:sharedchat-account:codex",
      runtimeKeyName: "Codex API Key",
      draft: expect.objectContaining({
        base_url: "https://sharedchat.example.invalid/v1",
        key: "sk-service-credential",
      }),
    })
  })

  it("normalizes account-token runtime key base URLs before preparing channel drafts", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const account = buildDisplaySiteData({
      id: "account-1",
      name: "Alpha",
      baseUrl: "https://upstream.example.com/v1",
    })
    const token = buildAccountToken()

    await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput(account, token)],
    })

    expect(service.prepareChannelFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "account-1",
        baseUrl: "https://upstream.example.com",
      }),
      expect.objectContaining({
        id: token.id,
        key: "token-secret",
      }),
      expectBatchDraftOptions(),
    )
  })

  it("falls back to normalized account base URL for blank account-token runtime key base URLs", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const account = buildDisplaySiteData({
      id: "account-1",
      name: "Alpha",
      baseUrl: "https://upstream.example.com/v1",
    })
    const token = buildAccountToken()
    const runtimeKey = buildAccountTokenRuntimeKey(account, token)

    await prepareManagedSiteTokenBatchExportPreview({
      items: [
        {
          account,
          runtimeKey: {
            ...runtimeKey,
            baseUrl: "   ",
          },
        },
      ],
    })

    expect(service.prepareChannelFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "account-1",
        baseUrl: "https://upstream.example.com",
      }),
      expect.objectContaining({
        id: token.id,
        key: "token-secret",
      }),
      expectBatchDraftOptions(),
    )
  })

  it("falls back to normalized account base URL for blank service-credential runtime key base URLs", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      baseUrl: "https://sharedchat.example.invalid/v1",
    })
    const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex API Key",
        key: "sk-service-credential",
        baseUrl: "   ",
        isAuthenticated: true,
      },
    )

    await prepareManagedSiteTokenBatchExportPreview({
      items: [
        {
          account,
          runtimeKey: serviceCredentialRuntimeKey,
        },
      ],
    })

    expect(service.prepareChannelFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sharedchat-account",
        baseUrl: "https://sharedchat.example.invalid",
      }),
      expect.objectContaining({
        id: -1,
        name: "Codex API Key",
        key: "sk-service-credential",
      }),
      expectBatchDraftOptions(),
    )
  })

  it("reports channel creation failures without marking the item created", async () => {
    const service = buildService({
      createChannel: vi.fn().mockResolvedValue({
        outcome: "rejected",
        diagnostic: { message: "channel rejected token-secret" },
      }),
    })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockGetManagedSiteServiceForType.mockReturnValue(service)

    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    const result = await executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: [preview.items[0].id],
    })

    expect(service.createChannel).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
    })
    expect(result.items[0]).toMatchObject({
      id: preview.items[0].id,
      result: "failed",
      success: false,
      skipped: false,
      error: "Failed to create channel: channel rejected [REDACTED]",
    })
    expect(JSON.stringify(result)).not.toContain("token-secret")
  })

  it.each(["partial", "uncertain"] as const)(
    "records a controlled uncertain category for a %s create without raw diagnostics",
    async (outcome) => {
      const service = buildService({
        createChannel: vi.fn().mockResolvedValue(
          outcome === "partial"
            ? {
                outcome,
                confirmedEffects: [
                  {
                    kind: "resource-created",
                    resourceKind: "channel",
                    resourceId: 77,
                  },
                ],
                completion: "uncertain",
                diagnostic: { message: "private ambiguous provider text" },
              }
            : {
                outcome,
                diagnostic: { message: "private ambiguous provider text" },
              },
        ),
      })
      mockGetManagedSiteService.mockResolvedValue(service)
      mockGetManagedSiteServiceForType.mockReturnValue(service)
      const {
        prepareManagedSiteTokenBatchExportPreview,
        executeManagedSiteTokenBatchExport,
      } = await import("~/services/managedSites/tokenBatchExport")
      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [buildAccountTokenInput()],
      })

      const result = await executeManagedSiteTokenBatchExport({
        preview,
        selectedItemIds: [preview.items[0].id],
      })

      expect(service.createChannel).toHaveBeenCalledOnce()
      expect(service.listChannels).toHaveBeenCalledOnce()
      expect(result.items[0]).toMatchObject({
        result: "uncertain",
        success: false,
        skipped: false,
        error: "Failed to create channel: private ambiguous provider text",
      })
    },
  )

  it("reconciles before propagating a thrown create unchanged without replay", async () => {
    const config = {
      baseUrl: "https://target.example.com",
      adminToken: "admin-secret",
      userId: "1",
    }
    const payloadSecret = "payload-secret"
    const thrown = new Error("write programming failure")
    const service = buildService({
      getConfig: vi.fn().mockResolvedValue(config),
      buildChannelPayload: vi.fn((draft) => ({
        mode: "single" as const,
        channel: { ...draft, key: payloadSecret },
      })),
      createChannel: vi.fn().mockImplementation(async () => {
        config.adminToken = "mutated-after-snapshot"
        throw thrown
      }),
    })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockGetManagedSiteServiceForType.mockReturnValue(service)

    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    await expect(
      executeManagedSiteTokenBatchExport({
        preview,
        selectedItemIds: [preview.items[0].id],
      }),
    ).rejects.toBe(thrown)

    expect(service.createChannel).toHaveBeenCalledTimes(1)
    expect(service.listChannels).toHaveBeenCalledOnce()
  })

  it("reconciles before rejecting a malformed create result without replay", async () => {
    const service = buildService({
      createChannel: vi.fn().mockResolvedValue(undefined),
    })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockGetManagedSiteServiceForType.mockReturnValue(service)

    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    await expect(
      executeManagedSiteTokenBatchExport({
        preview,
        selectedItemIds: [preview.items[0].id],
      }),
    ).rejects.toThrow("Invalid managed site mutation result")

    expect(service.createChannel).toHaveBeenCalledOnce()
    expect(service.listChannels).toHaveBeenCalledOnce()
  })

  it("settles in-flight writes and stops dependent items before propagating a create failure", async () => {
    const thrown = new Error("batch write invariant failed")
    let releaseInFlight!: () => void
    const inFlightCanSettle = new Promise<void>((resolve) => {
      releaseInFlight = resolve
    })
    const createChannel = vi.fn(async () => {
      if (createChannel.mock.calls.length === 1) throw thrown
      await inFlightCanSettle
      return {
        outcome: "succeeded" as const,
        data: undefined,
        confirmedEffects: [
          {
            kind: "resource-created" as const,
            resourceKind: "channel" as const,
          },
        ],
      }
    })
    const service = buildService({ createChannel })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockGetManagedSiteServiceForType.mockReturnValue(service)

    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")
    const inputs = Array.from({ length: 6 }, (_, index) => {
      const accountId = `account-${index + 1}`
      return buildAccountTokenInput(
        buildDisplaySiteData({ id: accountId, name: `Account ${index + 1}` }),
        buildAccountToken({
          id: index + 11,
          name: `Token ${index + 11}`,
          accountId,
          accountName: `Account ${index + 1}`,
        }),
      )
    })
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: inputs,
    })

    const execution = executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: preview.items.map((item) => item.id),
    }).then(
      () => ({ status: "resolved" as const, error: undefined }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    )

    await vi.waitFor(() => expect(createChannel).toHaveBeenCalledTimes(4))
    expect(service.listChannels).not.toHaveBeenCalled()
    releaseInFlight()

    await expect(execution).resolves.toEqual({
      status: "rejected",
      error: thrown,
    })
    expect(createChannel).toHaveBeenCalledTimes(4)
    expect(service.listChannels).toHaveBeenCalledOnce()
  })

  it("reconciles once after all ambiguous batch writes settle", async () => {
    const service = buildService({
      createChannel: vi.fn().mockResolvedValue({
        outcome: "uncertain",
        diagnostic: { message: "private ambiguous provider text" },
      }),
    })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockGetManagedSiteServiceForType.mockReturnValue(service)

    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [
        buildAccountTokenInput(),
        buildAccountTokenInput(
          buildDisplaySiteData({ id: "account-2", name: "Account 2" }),
          buildAccountToken({
            id: 12,
            name: "Token 12",
            accountId: "account-2",
            accountName: "Account 2",
          }),
        ),
      ],
    })

    const result = await executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: preview.items.map((item) => item.id),
    })

    expect(service.createChannel).toHaveBeenCalledTimes(2)
    expect(service.listChannels).toHaveBeenCalledOnce()
    expect(result.items.map((item) => item.error)).toEqual([
      "Failed to create channel: private ambiguous provider text",
      "Failed to create channel: private ambiguous provider text",
    ])
  })

  it("keeps pre-dispatch payload failures distinct and does not reconcile", async () => {
    const service = buildService({
      buildChannelPayload: vi.fn(() => {
        throw new Error("invalid draft")
      }),
    })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockGetManagedSiteServiceForType.mockReturnValue(service)

    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    const result = await executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: [preview.items[0].id],
    })

    expect(service.createChannel).not.toHaveBeenCalled()
    expect(service.listChannels).not.toHaveBeenCalled()
    expect(result.items[0]).toMatchObject({
      result: "failed",
      error: "Failed to create channel: invalid draft",
    })
  })

  it("skips tokens that exactly match an existing managed-site channel", async () => {
    const existingChannel = {
      id: 99,
      name: "Existing",
    }
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)
    mockResolveManagedSiteChannelMatch.mockResolvedValue(
      buildMatchInspection({
        key: {
          comparable: true,
          matched: true,
          reason: "matched",
          channel: existingChannel,
        },
        models: {
          comparable: true,
          matched: true,
          reason: "exact",
          channel: existingChannel,
        },
      }),
    )

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    expect(preview.skippedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
      matchedChannel: {
        id: 99,
        name: "Existing",
      },
    })
  })

  it("uses feature-gated resource target candidates for channel-shaped migrated token matching", async () => {
    vi.resetModules()
    vi.doUnmock("~/services/managedSites/channelMatchResolver")

    try {
      const resourceChannel = buildManagedSiteChannel({
        id: 64,
        key: "token-secret",
        base_url: "https://upstream.example.com/v1",
        models: "gpt-4o",
        name: "Resource duplicate",
      })
      const resourceRef = createManagedUpstreamResourceRef({
        managedSiteType: SITE_TYPES.NEW_API,
        scopeKey: "https://target.example.com",
        resourceId: 64,
      })
      const search = vi.fn().mockResolvedValue({
        items: [
          {
            ref: resourceRef,
            displayName: "Resource duplicate",
            endpointLabel: "https://upstream.example.com/v1",
            modelPreview: ["gpt-4o"],
          },
        ],
        total: 1,
      })
      const getDetail = vi.fn().mockResolvedValue({
        summary: {
          ref: resourceRef,
          displayName: "Resource duplicate",
          endpointLabel: "https://upstream.example.com/v1",
          modelPreview: ["gpt-4o"],
        },
        native: resourceChannel,
      })
      mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
        (siteType: string, feature: string) =>
          siteType === SITE_TYPES.NEW_API &&
          feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenBatchExport
            ? {
                supported: true,
                siteType,
                feature,
                capabilities: {
                  items: {
                    list: vi.fn(),
                    search,
                    getDetail,
                    create: vi.fn(),
                    update: vi.fn(),
                    delete: vi.fn(),
                  },
                  drafts: {
                    prepareImportDraft: vi.fn(),
                    prepareEditDraft: vi.fn(),
                    describeFields: vi.fn(),
                    validateDraft: vi.fn(),
                  },
                },
              }
            : {
                supported: false,
                siteType,
                feature,
                reason: "feature-slice-disabled",
              },
      )
      const service = buildService({
        searchChannel: vi.fn().mockResolvedValue({
          items: [],
          total: 0,
          type_counts: {},
        }),
      })
      mockGetManagedSiteService.mockResolvedValue(service)

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [
          buildAccountTokenInput(
            buildDisplaySiteData({
              baseUrl: "https://upstream.example.com/v1",
            }),
          ),
        ],
      })

      expect(search).toHaveBeenCalledWith(
        {
          baseUrl: "https://target.example.com",
          adminToken: "admin-token",
          userId: "1",
        },
        "https://upstream.example.com",
      )
      expect(getDetail).toHaveBeenCalledTimes(1)
      expect(service.searchChannel).not.toHaveBeenCalled()
      expect(preview.skippedCount).toBe(1)
      expect(preview.items[0]).toMatchObject({
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
        matchedChannel: {
          id: 64,
          name: "Resource duplicate",
        },
      })
    } finally {
      vi.doMock("~/services/managedSites/channelMatchResolver", () => ({
        createManagedSiteChannelMatchRequestCache:
          buildChannelMatchRequestCache,
        resolveManagedSiteChannelMatch: mockResolveManagedSiteChannelMatch,
      }))
      vi.resetModules()
    }
  })

  it("falls back to legacy target matching when the token batch export resource feature is unavailable", async () => {
    vi.resetModules()
    vi.doUnmock("~/services/managedSites/channelMatchResolver")

    try {
      const legacyChannel = buildManagedSiteChannel({
        id: 65,
        key: "token-secret",
        base_url: "https://upstream.example.com/v1",
        models: "gpt-4o",
        name: "Legacy duplicate",
      })
      const searchResourceDuplicateChannels = vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 66,
            key: "token-secret",
            base_url: "https://upstream.example.com/v1",
            models: "gpt-4o",
            name: "Wrong resource duplicate",
          }),
        ],
        total: 1,
        type_counts: {},
      })
      const service = buildService({
        searchChannel: vi.fn().mockResolvedValue({
          items: [legacyChannel],
          total: 1,
          type_counts: {},
        }),
        searchResourceDuplicateChannels,
      })
      mockGetManagedSiteService.mockResolvedValue(service)

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [
          buildAccountTokenInput(
            buildDisplaySiteData({
              baseUrl: "https://upstream.example.com/v1",
            }),
          ),
        ],
      })

      expect(searchResourceDuplicateChannels).not.toHaveBeenCalled()
      expect(service.searchChannel).toHaveBeenCalledWith(
        {
          baseUrl: "https://target.example.com",
          adminToken: "admin-token",
          userId: "1",
        },
        "https://upstream.example.com",
      )
      expect(preview.skippedCount).toBe(1)
      expect(preview.items[0]).toMatchObject({
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
        matchedChannel: {
          id: 65,
          name: "Legacy duplicate",
        },
      })
    } finally {
      vi.doMock("~/services/managedSites/channelMatchResolver", () => ({
        createManagedSiteChannelMatchRequestCache:
          buildChannelMatchRequestCache,
        resolveManagedSiteChannelMatch: mockResolveManagedSiteChannelMatch,
      }))
      vi.resetModules()
    }
  })

  it("blocks every preview item when the current managed site is not configured", async () => {
    const service = buildService({
      getConfig: vi.fn().mockResolvedValue(null),
    })
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING,
    })
    expect(service.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("keeps dedupe-unsupported targets executable with a warning", async () => {
    const service = buildService({
      siteType: SITE_TYPES.VELOERA,
      messagesKey: "veloera",
    })
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    expect(preview.warningCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      warningCodes: [
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.DEDUPE_UNSUPPORTED,
      ],
    })
    expect(mockResolveManagedSiteChannelMatch).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: "empty name",
      serviceOverrides: {
        prepareChannelFormData: vi.fn(async () => ({
          name: "   ",
          type: 1,
          key: "sk-live-token",
          base_url: "https://example.com",
          models: ["gpt-4o"],
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        })),
      },
      expectedReason:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.NAME_REQUIRED,
    },
    {
      label: "masked Claude Code Hub key",
      serviceOverrides: {
        siteType: SITE_TYPES.CLAUDE_CODE_HUB,
        messagesKey: "claudeCodeHub",
        prepareChannelFormData: vi.fn(async () => ({
          name: "Masked key",
          type: 1,
          key: "sk-****",
          base_url: "https://example.com",
          models: ["gpt-4o"],
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        })),
      },
      expectedReason:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.REAL_KEY_REQUIRED,
    },
    {
      label: "missing key",
      serviceOverrides: {
        prepareChannelFormData: vi.fn(async () => ({
          name: "Missing key",
          type: 1,
          key: " ",
          base_url: "https://example.com",
          models: ["gpt-4o"],
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        })),
      },
      expectedReason:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.KEY_REQUIRED,
    },
    {
      label: "missing base URL",
      serviceOverrides: {
        siteType: SITE_TYPES.AXON_HUB,
        messagesKey: "axonhub",
        prepareChannelFormData: vi.fn(async () => ({
          name: "Missing base URL",
          type: 1,
          key: "sk-live-token",
          base_url: " ",
          models: ["gpt-4o"],
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        })),
      },
      expectedReason:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED,
    },
    {
      label: "missing models",
      serviceOverrides: {
        prepareChannelFormData: vi.fn(async () => ({
          name: "Missing models",
          type: 1,
          key: "sk-live-token",
          base_url: "https://example.com",
          models: [],
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        })),
      },
      expectedReason:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED,
    },
  ])(
    "blocks preview items for invalid draft inputs: $label",
    async ({ serviceOverrides, expectedReason }) => {
      const service = buildService(
        serviceOverrides as Partial<ManagedSiteService>,
      )
      mockGetManagedSiteService.mockResolvedValue(service)

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [buildAccountTokenInput()],
      })

      expect(preview.items[0]).toMatchObject({
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
        blockingReasonCode: expectedReason,
      })
    },
  )

  it.each([
    {
      label: "backend search fails",
      resolution: buildMatchInspection({
        searchCompleted: false,
      }),
      expectedWarning:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.BACKEND_SEARCH_FAILED,
    },
    {
      label: "model prefill fetch failed",
      resolution: buildMatchInspection(),
      serviceOverrides: {
        prepareChannelFormData: vi.fn(async (account, token) => ({
          name: `${account.name} - ${token.name}`,
          type: 1,
          key: token.key,
          base_url: account.baseUrl,
          models: ["gpt-4o"],
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
          modelPrefillFetchFailed: true,
        })),
      },
      expectedWarning:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MODEL_PREFILL_FAILED,
    },
    {
      label: "exact verification is unavailable",
      resolution: buildMatchInspection({
        url: {
          matched: true,
          channel: { id: 7, name: "Similar" },
          candidateCount: 1,
        },
        key: {
          comparable: false,
          matched: false,
          reason: "masked",
          channel: null,
        },
      }),
      expectedWarning:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
    },
    {
      label: "partial match requires confirmation",
      resolution: buildMatchInspection({
        models: {
          comparable: true,
          matched: true,
          reason: "partial",
          channel: { id: 12, name: "Candidate" },
        },
      }),
      expectedWarning:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION,
    },
  ])(
    "keeps preview items executable with warnings when $label",
    async ({ resolution, serviceOverrides, expectedWarning }) => {
      const service = buildService(
        serviceOverrides as Partial<ManagedSiteService>,
      )
      mockGetManagedSiteService.mockResolvedValue(service)
      mockResolveManagedSiteChannelMatch.mockResolvedValue(resolution)

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [buildAccountTokenInput()],
      })

      expect(preview.items[0]).toMatchObject({
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      })
      expect(preview.items[0].warningCodes).toContain(expectedWarning)
    },
  )

  it("warns instead of marking ready when exact duplicate verification is unavailable", async () => {
    vi.resetModules()
    vi.doUnmock("~/services/managedSites/channelMatchResolver")

    try {
      const {
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
        MatchResolutionUnresolvedError,
      } = await import("~/services/managedSites/channelMatch")

      const hydrateComparableChannelKeys = vi.fn(async () => {
        throw new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
        )
      })
      const service = buildService({
        searchChannel: vi.fn().mockResolvedValue({
          items: [
            buildManagedSiteChannel({
              id: 77,
              key: "",
              base_url: "https://upstream.example.com/v1",
              models: "gpt-4o",
            }),
          ],
          total: 1,
          type_counts: {},
        }),
        hydrateComparableChannelKeys,
      })
      mockGetManagedSiteService.mockResolvedValue(service)

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [
          buildAccountTokenInput(
            buildDisplaySiteData({
              baseUrl: "https://upstream.example.com/",
            }),
          ),
        ],
        protectionBypassExecution: sessionResyncExecution,
      })

      expect(hydrateComparableChannelKeys).toHaveBeenCalled()
      expect(preview.items[0]).toMatchObject({
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
        warningCodes: [
          MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
        ],
      })
    } finally {
      vi.doMock("~/services/managedSites/channelMatchResolver", () => ({
        createManagedSiteChannelMatchRequestCache: () => ({
          searchResultsByBaseUrl: new Map(),
          channelSecretKeysById: new Map(),
          resolvedChannelKeysById: {},
        }),
        resolveManagedSiteChannelMatch: mockResolveManagedSiteChannelMatch,
      }))
      vi.resetModules()
    }
  })

  it("does not expose New API verification candidates for other managed-site types", async () => {
    const service = buildService({
      siteType: SITE_TYPES.DONE_HUB,
      messagesKey: "donehub",
    })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockResolveManagedSiteChannelMatch.mockResolvedValue(
      buildMatchInspection({
        searchCompleted: true,
        url: {
          matched: true,
          channel: buildManagedSiteChannel({
            id: 78,
            name: "DoneHub Channel",
          }),
          candidateCount: 1,
        },
        key: {
          comparable: false,
          matched: false,
          reason: "comparison-unavailable",
          channel: null,
        },
        models: {
          comparable: true,
          matched: true,
          reason: "exact",
          channel: buildManagedSiteChannel({
            id: 78,
            name: "DoneHub Channel",
          }),
        },
      }),
    )

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      warningCodes: [
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
      ],
    })
    expect(preview.items[0].verificationCandidate).toBeUndefined()
  })

  it("skips exact duplicates when preview can resolve a hidden managed-site channel key", async () => {
    vi.resetModules()
    vi.doUnmock("~/services/managedSites/channelMatchResolver")

    try {
      const fetchChannelSecretKey = vi.fn().mockResolvedValue("token-secret")
      const service = buildService({
        searchChannel: vi.fn().mockResolvedValue({
          items: [
            buildManagedSiteChannel({
              id: 77,
              key: "",
              base_url: "https://upstream.example.com/v1",
              models: "gpt-4o",
            }),
          ],
          total: 1,
          type_counts: {},
        }),
        fetchChannelSecretKey,
      })
      mockGetManagedSiteService.mockResolvedValue(service)

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [
          buildAccountTokenInput(
            buildDisplaySiteData({
              baseUrl: "https://upstream.example.com/",
            }),
          ),
        ],
        protectionBypassExecution: sessionResyncExecution,
      })

      expect(fetchChannelSecretKey).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://target.example.com",
          adminToken: "admin-token",
          userId: "1",
        }),
        77,
        sessionResyncOptions,
      )
      expect(preview.items[0]).toMatchObject({
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
        matchedChannel: {
          id: 77,
        },
      })
    } finally {
      vi.doMock("~/services/managedSites/channelMatchResolver", () => ({
        createManagedSiteChannelMatchRequestCache: () => ({
          searchResultsByBaseUrl: new Map(),
          channelSecretKeysById: new Map(),
          resolvedChannelKeysById: {},
        }),
        resolveManagedSiteChannelMatch: mockResolveManagedSiteChannelMatch,
      }))
      vi.resetModules()
    }
  })

  it("reuses managed-site draft and duplicate-check request caches across preview items with the same base URL", async () => {
    vi.resetModules()
    vi.doUnmock("~/services/managedSites/channelMatchResolver")

    try {
      const searchChannel = vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 77,
            key: "sk-***",
            base_url: "https://upstream.example.com/v1",
            models: "gpt-4o",
          }),
        ],
        total: 1,
        type_counts: {},
      })
      const fetchChannelSecretKey = vi.fn().mockResolvedValue("token-secret")
      const service = buildService({
        searchChannel,
        fetchChannelSecretKey,
      })
      mockGetManagedSiteService.mockResolvedValue(service)

      const account = buildDisplaySiteData({
        id: "account-1",
        name: "Alpha",
        baseUrl: "https://upstream.example.com/v1",
      })
      const firstToken = buildAccountToken({
        id: 11,
        name: "Token 11",
        key: "token-secret",
      })
      const secondToken = buildAccountToken({
        id: 12,
        name: "Token 12",
        key: "token-secret",
      })

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [
          buildAccountTokenInput(account, firstToken),
          buildAccountTokenInput(account, secondToken),
        ],
        protectionBypassExecution: sessionResyncExecution,
      })

      expect(searchChannel).toHaveBeenCalledTimes(1)
      expect(fetchChannelSecretKey).toHaveBeenCalledTimes(1)
      const prepareChannelFormDataMock = vi.mocked(
        service.prepareChannelFormData,
      )
      const firstDraftOptions = prepareChannelFormDataMock.mock.calls[0]?.[2]
      const secondDraftOptions = prepareChannelFormDataMock.mock.calls[1]?.[2]
      expect(firstDraftOptions).toEqual(expectBatchDraftOptions())
      expect(firstDraftOptions?.operationContext).toBe(
        secondDraftOptions?.operationContext,
      )
      expect(preview.skippedCount).toBe(2)
      expect(preview.items.map((item) => item.matchedChannel?.id)).toEqual([
        77, 77,
      ])
    } finally {
      vi.doMock("~/services/managedSites/channelMatchResolver", () => ({
        createManagedSiteChannelMatchRequestCache: () => ({
          searchResultsByBaseUrl: new Map(),
          channelSecretKeysById: new Map(),
          resolvedChannelKeysById: {},
        }),
        resolveManagedSiteChannelMatch: mockResolveManagedSiteChannelMatch,
      }))
      vi.resetModules()
    }
  })

  it("blocks the preview when secret resolution fails", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)
    mockResolveDisplayAccountRuntimeKeySecret.mockRejectedValue(
      new Error("secret lookup failed"),
    )

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED,
    })
    expect(preview.items[0].blockingMessage).toBeTruthy()
  })

  it("blocks preview items when draft preparation throws", async () => {
    const service = buildService({
      prepareChannelFormData: vi.fn().mockRejectedValue(new Error("boom")),
    })
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
    })
    expect(preview.items[0].blockingMessage).toContain("boom")
  })

  it("redacts admin, password, and TOTP config secrets from preview failures", async () => {
    const adminToken = "batch-admin-token-placeholder"
    const password = "batch-password-placeholder"
    const totpSecret = "batch-totp-secret-placeholder"
    const service = buildService({
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://target.example.invalid",
        adminToken,
        password,
        totpSecret,
        userId: "1",
      }),
      prepareChannelFormData: vi
        .fn()
        .mockRejectedValue(
          new Error(
            `Preparation refused ${adminToken} ${password} ${totpSecret}`,
          ),
        ),
    })
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    const blockingMessage = preview.items[0].blockingMessage ?? ""
    expect(blockingMessage).toContain("Preparation refused")
    expect(blockingMessage).not.toContain(adminToken)
    expect(blockingMessage).not.toContain(password)
    expect(blockingMessage).not.toContain(totpSecret)
  })

  it("uses fallback preview feedback when config secret inspection is incomplete", async () => {
    const hiddenSecret = "batch-incomplete-totp-placeholder"
    const providerText = `Provider private diagnostic ${hiddenSecret}`
    const config = new Proxy(
      {
        baseUrl: "https://target.example.invalid",
        adminToken: "admin-token-placeholder",
        password: "password-placeholder",
        totpSecret: hiddenSecret,
        userId: "1",
      },
      {
        ownKeys() {
          throw new Error("config inspection unavailable")
        },
      },
    )
    const service = buildService({
      getConfig: vi.fn().mockResolvedValue(config),
      prepareChannelFormData: vi
        .fn()
        .mockRejectedValue(new Error(providerText)),
    })
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    expect(preview.items[0].blockingMessage).toBe(
      "Failed to prepare this key for batch import",
    )
    expect(JSON.stringify(preview)).not.toContain(providerText)
  })

  it("redacts provider-derived draft secrets from later preview failures", async () => {
    const draftSecret = "batch-draft-secret-placeholder"
    const providerText = `Matcher refused ${draftSecret}`
    const service = buildService({
      prepareChannelFormData: vi.fn().mockResolvedValue({
        name: "Draft secret",
        type: 1,
        key: "resolved-token-key-placeholder",
        base_url: "https://upstream.example.invalid",
        models: ["model-example"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
        providerSecret: draftSecret,
      }),
    })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockResolveManagedSiteChannelMatch.mockRejectedValue(
      new Error(providerText),
    )

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    const blockingMessage = preview.items[0].blockingMessage ?? ""
    expect(blockingMessage).toContain("Matcher refused")
    expect(blockingMessage).not.toContain(draftSecret)
  })

  it("uses fallback preview feedback when draft secret inspection is incomplete", async () => {
    const hiddenSecret = "batch-incomplete-draft-secret-placeholder"
    const providerText = `Matcher private diagnostic ${hiddenSecret}`
    const draft = new Proxy(
      {
        name: "Incomplete draft",
        type: 1,
        key: "resolved-token-key-placeholder",
        base_url: "https://upstream.example.invalid",
        models: ["model-example"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
        providerSecret: hiddenSecret,
      },
      {
        ownKeys() {
          throw new Error("draft inspection unavailable")
        },
      },
    )
    const service = buildService({
      prepareChannelFormData: vi.fn().mockResolvedValue(draft),
    })
    mockGetManagedSiteService.mockResolvedValue(service)
    mockResolveManagedSiteChannelMatch.mockRejectedValue(
      new Error(providerText),
    )

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput()],
    })

    expect(preview.items[0].blockingMessage).toBe(
      "Failed to prepare this key for batch import",
    )
    const serializedPreview = JSON.stringify(preview)
    expect(serializedPreview).not.toContain(providerText)
    expect(serializedPreview).not.toContain(hiddenSecret)
  })

  it.each([
    ["manual selection", manualCompleteIntent],
    ["repair-created complete", repairCompleteIntent],
  ])(
    "runs complete duplicate and hidden-key verification for %s",
    async (_, intent) => {
      const service = buildService()
      useManagedSiteService(service)

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [buildAccountTokenInput()],
        intent,
      })

      expect(preview.intent).toEqual(intent)
      expect(preview.targetFingerprint).toMatch(/^[a-f0-9]{64}$/)
      expect(preview.targetSummary).toEqual({
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://target.example.com",
        compatibleUserId: "1",
      })
      expect(mockResolveManagedSiteChannelMatch).toHaveBeenCalledWith(
        expect.objectContaining({ resolveHiddenKeys: true }),
      )
    },
  )

  it("keeps trusted-new repair preparation mandatory while bypassing only duplicate verification", async () => {
    const service = buildService({
      prepareChannelFormData: vi.fn(async (account, token) => ({
        name: `${account.name} - ${token.name}`,
        type: 1,
        key: token.key,
        base_url: account.baseUrl,
        models: token.id === 12 ? [] : ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1 as const,
      })),
    })
    useManagedSiteService(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )
    const account = buildDisplaySiteData()
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      intent: repairTrustedNewIntent,
      items: [
        buildAccountTokenInput(account, buildAccountToken({ id: 11 })),
        buildAccountTokenInput(account, buildAccountToken({ id: 12 })),
      ],
    })

    expect(mockResolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledTimes(2)
    expect(service.prepareChannelFormData).toHaveBeenCalledTimes(2)
    expect(mockResolveManagedSiteChannelMatch).not.toHaveBeenCalled()
    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      draft: expect.objectContaining({ models: ["gpt-4o"] }),
    })
    expect(preview.items[1]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED,
    })
  })

  it("keeps an explicitly unresolved repair input as a blocked preview row", async () => {
    const service = buildService()
    useManagedSiteService(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      intent: repairTrustedNewIntent,
      items: [
        {
          kind: "blocked-reference",
          id: "repair-key-17",
          accountLabel: "Recovered account",
          keyLabel: "Recovered group",
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED,
          localFallback: "The source key could not be resolved",
        },
      ],
    })

    expect(service.prepareChannelFormData).not.toHaveBeenCalled()
    expect(preview.items).toEqual([
      expect.objectContaining({
        id: "repair-key-17",
        accountName: "Recovered account",
        runtimeKeyName: "Recovered group",
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
        blockingReasonCode:
          MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED,
        blockingMessage: "The source key could not be resolved",
      }),
    ])
  })

  it.each([manualCompleteIntent, repairTrustedNewIntent])(
    "prevents writes when the target fingerprint changes for $source/$verification",
    async (intent) => {
      const service = buildService()
      useManagedSiteService(service)
      const {
        prepareManagedSiteTokenBatchExportPreview,
        executeManagedSiteTokenBatchExport,
      } = await import("~/services/managedSites/tokenBatchExport")
      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [buildAccountTokenInput()],
        intent,
      })

      vi.mocked(service.getConfig).mockResolvedValue({
        baseUrl: "https://changed-target.example.invalid",
        adminToken: "changed-admin-token",
        userId: "2",
      })

      await expect(
        executeManagedSiteTokenBatchExport({
          preview,
          selectedItemIds: [preview.items[0].id],
        }),
      ).rejects.toMatchObject({
        name: "ManagedSiteTokenBatchImportTargetChangedError",
        code: "managed-site-token-import-target-changed",
      })
      expect(service.createChannel).not.toHaveBeenCalled()
    },
  )

  it("returns execution items and counts only for selected attempted rows", async () => {
    const service = buildService()
    useManagedSiteService(service)
    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [
        buildAccountTokenInput(),
        buildAccountTokenInput(
          buildDisplaySiteData({ id: "account-2", name: "Account 2" }),
          buildAccountToken({
            id: 12,
            accountId: "account-2",
            accountName: "Account 2",
          }),
        ),
      ],
    })

    const result = await executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: [preview.items[0].id],
    })

    expect(result).toMatchObject({
      totalSelected: 1,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      uncertainCount: 0,
      skippedCount: 0,
    })
    expect(result.items).toEqual([
      expect.objectContaining({
        id: preview.items[0].id,
        result: "created",
      }),
    ])
  })

  it("uses four workers and one ordinary provider create call per selected key", async () => {
    let activeCreates = 0
    let maxActiveCreates = 0
    const releaseCreates: Array<() => void> = []
    const createChannel = vi.fn(async () => {
      activeCreates += 1
      maxActiveCreates = Math.max(maxActiveCreates, activeCreates)
      await new Promise<void>((resolve) => releaseCreates.push(resolve))
      activeCreates -= 1
      return {
        outcome: "succeeded" as const,
        data: null,
        confirmedEffects: [
          {
            kind: "resource-created" as const,
            resourceKind: "channel" as const,
          },
        ],
        message: "ok",
      }
    })
    const service = buildService({ createChannel })
    useManagedSiteService(service)
    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")
    const account = buildDisplaySiteData()
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      intent: repairTrustedNewIntent,
      items: Array.from({ length: 6 }, (_, index) =>
        buildAccountTokenInput(
          account,
          buildAccountToken({ id: index + 1, name: `Key ${index + 1}` }),
        ),
      ),
    })

    const execution = executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: preview.items.map((item) => item.id),
    })
    await vi.waitFor(() => expect(createChannel).toHaveBeenCalledTimes(4))
    expect(maxActiveCreates).toBe(4)
    releaseCreates.splice(0).forEach((release) => release())
    await vi.waitFor(() => expect(createChannel).toHaveBeenCalledTimes(6))
    releaseCreates.splice(0).forEach((release) => release())

    const result = await execution
    expect(createChannel).toHaveBeenCalledTimes(6)
    expect(
      vi
        .mocked(service.createChannel)
        .mock.calls.map(([, payload]) => payload.mode),
    ).toEqual(Array(6).fill("single"))
    expect(
      vi
        .mocked(service.buildChannelPayload)
        .mock.calls.map(([draft]) => draft.key),
    ).toHaveLength(6)
    expect(result.items).toHaveLength(6)
    expect(result.items.every((item) => item.result === "created")).toBe(true)
  })

  it.each([
    [401, API_ERROR_CODES.HTTP_401, "account session expired"],
    [403, API_ERROR_CODES.HTTP_403, "admin permission denied"],
  ])(
    "keeps a safe local fallback plus HTTP %i provider details in private results",
    async (statusCode, code, message) => {
      const service = buildService({
        createChannel: vi.fn().mockResolvedValue({
          outcome: "rejected",
          diagnostic: {
            statusCode,
            code,
            message,
          },
        }),
      })
      useManagedSiteService(service)
      const {
        prepareManagedSiteTokenBatchExportPreview,
        executeManagedSiteTokenBatchExport,
      } = await import("~/services/managedSites/tokenBatchExport")
      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [buildAccountTokenInput()],
      })
      const result = await executeManagedSiteTokenBatchExport({
        preview,
        selectedItemIds: [preview.items[0].id],
      })

      expect(result.items[0]).toMatchObject({ result: "failed" })
      expect(result.items[0].error).toContain("Failed to create channel")
      expect(result.items[0].error).toContain(`HTTP ${statusCode}`)
      expect(result.items[0].error).toContain(message)
    },
  )

  it("throws a target-changed failure when the managed-site config disappears before execution", async () => {
    const service = buildService()
    useManagedSiteService(service)

    const {
      prepareManagedSiteTokenBatchExportPreview,
      executeManagedSiteTokenBatchExport,
    } = await import("~/services/managedSites/tokenBatchExport")

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [
        buildAccountTokenInput(),
        buildAccountTokenInput(
          buildDisplaySiteData({ id: "account-2", name: "Account 2" }),
          buildAccountToken({
            id: 12,
            accountId: "account-2",
            accountName: "Account 2",
            name: "Token 12",
          }),
        ),
      ],
    })

    vi.mocked(service.getConfig).mockResolvedValue(null)
    await expect(
      executeManagedSiteTokenBatchExport({
        preview,
        selectedItemIds: [preview.items[0].id],
      }),
    ).rejects.toMatchObject({
      name: "ManagedSiteTokenBatchImportTargetChangedError",
    })
    expect(service.createChannel).not.toHaveBeenCalled()
  })
})
