import { beforeEach, describe, expect, it, vi } from "vitest"

import { NEW_API, VELOERA } from "~/constants/siteType"
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
})
