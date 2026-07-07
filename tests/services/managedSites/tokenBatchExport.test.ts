import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { ManagedSiteService } from "~/services/managedSites/managedSiteService"
import type { AccountToken } from "~/types"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
} from "~/types/managedSiteTokenBatchExport"
import {
  buildApiToken,
  buildDisplaySiteData,
  buildManagedSiteChannel,
} from "~~/tests/test-utils/factories"

const {
  mockResolveDisplayAccountRuntimeKeySecret,
  mockGetManagedSiteService,
  mockGetManagedSiteServiceForType,
  mockResolveManagedSiteChannelMatch,
} = vi.hoisted(() => ({
  mockResolveDisplayAccountRuntimeKeySecret: vi.fn(),
  mockGetManagedSiteService: vi.fn(),
  mockGetManagedSiteServiceForType: vi.fn(),
  mockResolveManagedSiteChannelMatch: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret:
    mockResolveDisplayAccountRuntimeKeySecret,
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: mockGetManagedSiteService,
  getManagedSiteServiceForType: mockGetManagedSiteServiceForType,
}))

vi.mock("~/services/managedSites/channelMatchResolver", () => ({
  createManagedSiteChannelMatchRequestCache: () => ({
    searchResultsByBaseUrl: new Map(),
    channelSecretKeysById: new Map(),
    resolvedChannelKeysById: {},
  }),
  resolveManagedSiteChannelMatch: mockResolveManagedSiteChannelMatch,
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
      success: true,
      message: "ok",
    }),
    searchChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    checkValidConfig: vi.fn(),
    fetchSiteUserGroups: vi.fn().mockResolvedValue([]),
    fetchAccountAvailableModels: vi.fn().mockResolvedValue([]),
    fetchAvailableModels: vi.fn(),
    buildChannelName: vi.fn(),
    ...overrides,
  }) as ManagedSiteService

const expectBatchDraftOptions = () =>
  expect.objectContaining({
    operationContext: expect.any(Object),
  })

describe("managed-site token batch export", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockResolveDisplayAccountRuntimeKeySecret.mockImplementation(
      async (_account, runtimeKey) => runtimeKey,
    )
    mockResolveManagedSiteChannelMatch.mockResolvedValue(buildMatchInspection())
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
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [buildAccountTokenInput(account, token)],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      accountName: "Alpha",
      runtimeKeyName: "Token 11",
    })

    const result = await executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: [preview.items[0].id],
    })

    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
    })
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
        success: false,
        message: "channel rejected",
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
      success: false,
      skipped: false,
      error: "channel rejected",
    })
  })

  it("marks execution as failed when createChannel throws", async () => {
    const service = buildService({
      createChannel: vi.fn().mockRejectedValue(new Error("transport error")),
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
      success: false,
      skipped: false,
      error: "transport error",
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
      })

      expect(fetchChannelSecretKey).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://target.example.com",
          adminToken: "admin-token",
          userId: "1",
        }),
        77,
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

  it("returns failed execution items when the managed-site config disappears before execution", async () => {
    const service = buildService()
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
            accountId: "account-2",
            accountName: "Account 2",
            name: "Token 12",
          }),
        ),
      ],
    })

    vi.mocked(service.getConfig).mockResolvedValue(null)
    const result = await executeManagedSiteTokenBatchExport({
      preview,
      selectedItemIds: [preview.items[0].id],
    })

    expect(result).toMatchObject({
      totalSelected: 1,
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 1,
    })
    expect(result.items[0]).toMatchObject({
      id: preview.items[0].id,
      success: false,
      skipped: false,
      error:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING,
    })
    expect(result.items[1]).toMatchObject({
      id: preview.items[1].id,
      success: false,
      skipped: true,
    })
  })
})
