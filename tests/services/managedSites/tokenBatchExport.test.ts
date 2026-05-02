import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AXON_HUB,
  CLAUDE_CODE_HUB,
  NEW_API,
  VELOERA,
} from "~/constants/siteType"
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
} from "~~/tests/test-utils/factories"

const mockResolveDisplayAccountTokenForSecret = vi.fn()
const mockGetManagedSiteService = vi.fn()
const mockGetManagedSiteServiceForType = vi.fn()
const mockResolveManagedSiteChannelMatch = vi.fn()

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountTokenForSecret: mockResolveDisplayAccountTokenForSecret,
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: mockGetManagedSiteService,
  getManagedSiteServiceForType: mockGetManagedSiteServiceForType,
}))

vi.mock("~/services/managedSites/channelMatchResolver", () => ({
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
    siteType: NEW_API,
    messagesKey: "newapi",
    getConfig: vi.fn().mockResolvedValue({
      baseUrl: "https://target.example.com",
      token: "admin-token",
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
    fetchAvailableModels: vi.fn(),
    buildChannelName: vi.fn(),
    findMatchingChannel: vi.fn(),
    autoConfigToManagedSite: vi.fn(),
    ...overrides,
  }) as ManagedSiteService

describe("managed-site token batch export", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveDisplayAccountTokenForSecret.mockImplementation(
      async (_account, token) => token,
    )
    mockResolveManagedSiteChannelMatch.mockResolvedValue(buildMatchInspection())
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
      items: [{ account, token }],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      accountName: "Alpha",
      tokenName: "Token 11",
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
      items: [
        {
          account: buildDisplaySiteData(),
          token: buildAccountToken(),
        },
      ],
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
      items: [
        {
          account: buildDisplaySiteData(),
          token: buildAccountToken(),
        },
      ],
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
      items: [
        {
          account: buildDisplaySiteData(),
          token: buildAccountToken(),
        },
      ],
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
      siteType: VELOERA,
      messagesKey: "veloera",
    })
    mockGetManagedSiteService.mockResolvedValue(service)

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [
        {
          account: buildDisplaySiteData(),
          token: buildAccountToken(),
        },
      ],
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
        siteType: CLAUDE_CODE_HUB,
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
        siteType: AXON_HUB,
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
        items: [
          {
            account: buildDisplaySiteData(),
            token: buildAccountToken(),
          },
        ],
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
    async ({ resolution, expectedWarning }) => {
      const service = buildService()
      mockGetManagedSiteService.mockResolvedValue(service)
      mockResolveManagedSiteChannelMatch.mockResolvedValue(resolution)

      const { prepareManagedSiteTokenBatchExportPreview } = await import(
        "~/services/managedSites/tokenBatchExport"
      )

      const preview = await prepareManagedSiteTokenBatchExportPreview({
        items: [
          {
            account: buildDisplaySiteData(),
            token: buildAccountToken(),
          },
        ],
      })

      expect(preview.items[0]).toMatchObject({
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      })
      expect(preview.items[0].warningCodes).toContain(expectedWarning)
    },
  )

  it("blocks the preview when secret resolution fails", async () => {
    const service = buildService()
    mockGetManagedSiteService.mockResolvedValue(service)
    mockResolveDisplayAccountTokenForSecret.mockRejectedValue(
      new Error("secret lookup failed"),
    )

    const { prepareManagedSiteTokenBatchExportPreview } = await import(
      "~/services/managedSites/tokenBatchExport"
    )

    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [
        {
          account: buildDisplaySiteData(),
          token: buildAccountToken(),
        },
      ],
    })

    expect(preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED,
    })
    expect(preview.items[0].blockingMessage).toBeTruthy()
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
        {
          account: buildDisplaySiteData(),
          token: buildAccountToken(),
        },
        {
          account: buildDisplaySiteData({ id: "account-2", name: "Account 2" }),
          token: buildAccountToken({
            id: 12,
            accountId: "account-2",
            accountName: "Account 2",
            name: "Token 12",
          }),
        },
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
