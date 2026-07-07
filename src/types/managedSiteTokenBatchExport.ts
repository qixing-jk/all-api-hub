import type { ManagedSiteType } from "~/constants/siteType"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type {
  ManagedSiteAssessmentChannel,
  ManagedSiteVerifiedKeyAssessment,
} from "~/services/managedSites/verifiedChannelKeyAssessment"
import type { DisplaySiteData } from "~/types"

import type { ChannelFormData } from "./managedSite"

export const MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES = {
  READY: "ready",
  WARNING: "warning",
  SKIPPED: "skipped",
  BLOCKED: "blocked",
} as const

export type ManagedSiteTokenBatchExportPreviewStatus =
  (typeof MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES)[keyof typeof MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES]

export const MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES = {
  MODEL_PREFILL_FAILED: "model-prefill-failed",
  MATCH_REQUIRES_CONFIRMATION: "match-requires-confirmation",
  EXACT_VERIFICATION_UNAVAILABLE: "exact-verification-unavailable",
  BACKEND_SEARCH_FAILED: "backend-search-failed",
  DEDUPE_UNSUPPORTED: "dedupe-unsupported",
} as const

export type ManagedSiteTokenBatchExportWarningCode =
  (typeof MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES)[keyof typeof MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES]

export const MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES = {
  CONFIG_MISSING: "config-missing",
  SECRET_RESOLUTION_FAILED: "secret-resolution-failed",
  INPUT_PREPARATION_FAILED: "input-preparation-failed",
  NAME_REQUIRED: "name-required",
  KEY_REQUIRED: "key-required",
  REAL_KEY_REQUIRED: "real-key-required",
  BASE_URL_REQUIRED: "base-url-required",
  MODELS_REQUIRED: "models-required",
} as const

export type ManagedSiteTokenBatchExportBlockedReasonCode =
  (typeof MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES)[keyof typeof MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES]

export type ManagedSiteTokenBatchExportItemInput = {
  account: DisplaySiteData
  runtimeKey: AccountRuntimeKey
}

export type ManagedSiteTokenBatchExportMatchedChannel =
  ManagedSiteAssessmentChannel

export type ManagedSiteTokenBatchExportAssessment =
  ManagedSiteVerifiedKeyAssessment<ManagedSiteTokenBatchExportMatchedChannel>

export interface ManagedSiteTokenBatchExportPreviewItem {
  id: string
  accountId: string
  accountName: string
  runtimeKeyId: string
  runtimeKeyName: string
  draft: ChannelFormData | null
  status: ManagedSiteTokenBatchExportPreviewStatus
  warningCodes: ManagedSiteTokenBatchExportWarningCode[]
  blockingReasonCode?: ManagedSiteTokenBatchExportBlockedReasonCode
  blockingMessage?: string
  matchedChannel?: ManagedSiteTokenBatchExportMatchedChannel
  verificationCandidate?: ManagedSiteTokenBatchExportMatchedChannel
  assessment?: ManagedSiteTokenBatchExportAssessment
}

export type ExecutableManagedSiteTokenBatchExportPreviewItem =
  ManagedSiteTokenBatchExportPreviewItem & {
    draft: ChannelFormData
  }

export const isExecutableManagedSiteTokenBatchExportPreviewItem = (
  item: ManagedSiteTokenBatchExportPreviewItem,
): item is ExecutableManagedSiteTokenBatchExportPreviewItem =>
  item.draft !== null &&
  (item.status === MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY ||
    item.status === MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING)

export interface ManagedSiteTokenBatchExportPreview {
  siteType: ManagedSiteType
  items: ManagedSiteTokenBatchExportPreviewItem[]
  totalCount: number
  readyCount: number
  warningCount: number
  skippedCount: number
  blockedCount: number
}

export interface ManagedSiteTokenBatchExportExecutionItem {
  id: string
  accountName: string
  runtimeKeyName: string
  success: boolean
  skipped: boolean
  error?: string
}

export interface ManagedSiteTokenBatchExportExecutionResult {
  totalSelected: number
  attemptedCount: number
  createdCount: number
  failedCount: number
  skippedCount: number
  items: ManagedSiteTokenBatchExportExecutionItem[]
}
