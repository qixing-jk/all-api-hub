import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  applyResolvedChannelKeyToPreviewItem,
  canEditItemModels,
  countPreviewItems,
  getPreviewVerificationTargets,
  normalizeModels,
  shouldSelectPreviewItemByDefault,
  toModelOptions,
} from "~/features/KeyManagement/components/managedSiteTokenBatchExportPreview"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"

const candidate = {
  id: 12,
  name: "Managed Channel 12",
}

const buildPreviewItem = (
  fields: Partial<ManagedSiteTokenBatchExportPreviewItem> = {},
): ManagedSiteTokenBatchExportPreviewItem => ({
  id: "account_token:account-1:1",
  accountId: "account-1",
  accountName: "Account 1",
  runtimeKeyId: "account_token:account-1:1",
  runtimeKeyName: "Token 1",
  status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
  warningCodes: [],
  draft: {
    name: "Account 1 - Token 1",
    type: 1,
    key: "sk-source-key",
    base_url: "https://api.example.invalid",
    models: ["gpt-4o"],
    groups: ["default"],
    priority: 0,
    weight: 0,
    status: 1,
  },
  ...fields,
})

const buildRecoverablePreviewItem = (
  fields: Partial<ManagedSiteTokenBatchExportPreviewItem> = {},
) =>
  buildPreviewItem({
    status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
    warningCodes: [
      MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
    ],
    verificationCandidate: candidate,
    assessment: {
      searchBaseUrl: "https://api.example.invalid",
      searchCompleted: true,
      url: {
        matched: true,
        candidateCount: 1,
        channel: candidate,
      },
      key: {
        comparable: false,
        matched: false,
        reason: "comparison-unavailable",
      },
      models: {
        comparable: true,
        matched: true,
        reason: "exact",
        channel: candidate,
        similarityScore: 1,
      },
    },
    ...fields,
  })

describe("managedSiteTokenBatchExportPreview helpers", () => {
  it("normalizes model options without duplicate or blank entries", () => {
    expect(toModelOptions(normalizeModels([" gpt-4o ", "", "gpt-4o"]))).toEqual(
      [{ label: "gpt-4o", value: "gpt-4o" }],
    )
  })

  it("keeps duplicate-risk warning rows out of the default selection", () => {
    expect(
      shouldSelectPreviewItemByDefault(
        buildPreviewItem({
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
          warningCodes: [
            MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION,
          ],
        }),
      ),
    ).toBe(false)
    expect(shouldSelectPreviewItemByDefault(buildPreviewItem())).toBe(true)
  })

  it("allows editing models for executable rows and models-required blocked rows", () => {
    expect(canEditItemModels(buildPreviewItem())).toBe(true)
    expect(
      canEditItemModels(
        buildPreviewItem({
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED,
        }),
      ),
    ).toBe(true)
  })

  it("counts preview items by status", () => {
    expect(
      countPreviewItems([
        buildPreviewItem(),
        buildPreviewItem({
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
        }),
        buildPreviewItem({
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
        }),
        buildPreviewItem({
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
        }),
      ]),
    ).toEqual({
      readyCount: 1,
      warningCount: 1,
      skippedCount: 1,
      blockedCount: 1,
    })
  })

  it("collects New API verification targets from recoverable preview rows", () => {
    const preview: ManagedSiteTokenBatchExportPreview = {
      siteType: SITE_TYPES.NEW_API,
      totalCount: 2,
      readyCount: 1,
      warningCount: 1,
      skippedCount: 0,
      blockedCount: 0,
      items: [buildPreviewItem(), buildRecoverablePreviewItem()],
    }

    expect(getPreviewVerificationTargets(preview)).toEqual([
      {
        item: preview.items[1],
        candidate,
      },
    ])
  })

  it("marks a recoverable row skipped when the verified channel key is an exact match", () => {
    const item = buildRecoverablePreviewItem()

    expect(
      applyResolvedChannelKeyToPreviewItem({
        item,
        candidate,
        resolvedKey: "sk-source-key",
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
      warningCodes: [],
      matchedChannel: candidate,
      verificationCandidate: undefined,
      assessment: {
        key: {
          comparable: true,
          matched: true,
          channel: candidate,
        },
      },
    })
  })

  it("leaves preview rows unchanged when the resolved channel key cannot be compared", () => {
    const item = buildRecoverablePreviewItem({
      assessment: undefined,
    })

    expect(
      applyResolvedChannelKeyToPreviewItem({
        item,
        candidate,
        resolvedKey: "sk-source-key",
      }),
    ).toBe(item)
    expect(
      applyResolvedChannelKeyToPreviewItem({
        item: buildRecoverablePreviewItem({
          draft: {
            ...buildPreviewItem().draft!,
            key: " ",
          },
        }),
        candidate,
        resolvedKey: "sk-source-key",
      }),
    ).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
    })
  })

  it("keeps a recoverable row as warning when the verified channel key still needs confirmation", () => {
    const item = buildRecoverablePreviewItem()

    expect(
      applyResolvedChannelKeyToPreviewItem({
        item,
        candidate,
        resolvedKey: "sk-other-key",
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      warningCodes: [
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION,
      ],
      matchedChannel: undefined,
      verificationCandidate: undefined,
      assessment: {
        key: {
          comparable: true,
          matched: false,
        },
      },
    })
  })

  it("marks a recoverable row ready when verified key removes the only warning", () => {
    const item = buildRecoverablePreviewItem({
      assessment: {
        searchBaseUrl: "https://api.example.invalid",
        searchCompleted: true,
        url: {
          matched: false,
          candidateCount: 0,
        },
        key: {
          comparable: false,
          matched: false,
          reason: "comparison-unavailable",
        },
        models: {
          comparable: true,
          matched: false,
          reason: "no-match",
        },
      },
    })

    expect(
      applyResolvedChannelKeyToPreviewItem({
        item,
        candidate,
        resolvedKey: "test-other-key",
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      warningCodes: [],
      matchedChannel: undefined,
      verificationCandidate: undefined,
      assessment: {
        key: {
          comparable: true,
          matched: false,
        },
      },
    })
  })
})
