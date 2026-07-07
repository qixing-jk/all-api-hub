import type { TFunction } from "i18next"

import type { ManagedSiteTokenBatchExportPreviewItem } from "~/types/managedSiteTokenBatchExport"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
} from "~/types/managedSiteTokenBatchExport"

export type BatchExportBadgeVariant =
  | "success"
  | "warning"
  | "secondary"
  | "danger"

export const formatBatchExportValues = (items: string[] | undefined) =>
  items && items.length > 0 ? items.join(", ") : "-"

export const getBatchExportWarningText = (t: TFunction, code: string) => {
  switch (code) {
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MODEL_PREFILL_FAILED:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.modelPrefillFailed",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.matchRequiresConfirmation",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.exactVerificationUnavailable",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.BACKEND_SEARCH_FAILED:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.backendSearchFailed",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.DEDUPE_UNSUPPORTED:
    default:
      return t(
        "keyManagement:batchManagedSiteExport.warnings.dedupeUnsupported",
      )
  }
}

export const getBatchExportBlockedReasonText = (
  t: TFunction,
  code?: string | null | undefined,
) => {
  switch (code) {
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.configMissing",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.secretResolutionFailed",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.NAME_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.nameRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.KEY_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.keyRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.REAL_KEY_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.realKeyRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.baseUrlRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.modelsRequired",
      )
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED:
      return t(
        "keyManagement:batchManagedSiteExport.blockedReasons.inputPreparationFailed",
      )
    default:
      return null
  }
}

export const getBatchExportExecutionErrorText = (
  t: TFunction,
  error?: string | null,
) => {
  const blockedReasonText = getBatchExportBlockedReasonText(t, error)
  if (blockedReasonText) {
    return blockedReasonText
  }

  const trimmedError = error?.trim()
  return (
    trimmedError ||
    t("keyManagement:batchManagedSiteExport.results.channelCreationFailed")
  )
}

export const getBatchExportStatusBadge = (
  t: TFunction,
  item: ManagedSiteTokenBatchExportPreviewItem,
): { label: string; variant: BatchExportBadgeVariant } => {
  switch (item.status) {
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY:
      return {
        label: t("keyManagement:batchManagedSiteExport.status.ready"),
        variant: "success",
      }
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING:
      return {
        label: t("keyManagement:batchManagedSiteExport.status.warning"),
        variant: "warning",
      }
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED:
      return {
        label: t("keyManagement:batchManagedSiteExport.status.skipped"),
        variant: "secondary",
      }
    case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED:
    default:
      return {
        label: t("keyManagement:batchManagedSiteExport.status.blocked"),
        variant: "danger",
      }
  }
}
