import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { applyVerifiedManagedSiteChannelKey } from "~/services/managedSites/verifiedChannelKeyAssessment"
import type {
  ManagedSiteTokenBatchExportMatchedChannel,
  ManagedSiteTokenBatchExportPreview,
  ManagedSiteTokenBatchExportPreviewItem,
  ManagedSiteTokenBatchExportWarningCode,
} from "~/types/managedSiteTokenBatchExport"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem as isExecutablePreviewItem,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
} from "~/types/managedSiteTokenBatchExport"

export const canEditItemModels = (
  item: ManagedSiteTokenBatchExportPreviewItem,
) =>
  isExecutablePreviewItem(item) ||
  (Boolean(item.draft) &&
    item.status === MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED &&
    item.blockingReasonCode ===
      MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED)

export const toModelOptions = (models: string[]) =>
  models.map((model) => ({ label: model, value: model }))

export const normalizeModels = (models: string[]) =>
  Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)))

export const applyNormalizedModelsToPreviewItem = (
  item: ManagedSiteTokenBatchExportPreviewItem,
  models: string[],
): ManagedSiteTokenBatchExportPreviewItem => {
  if (!item.draft) {
    return item
  }

  if (models.length === 0) {
    return {
      ...item,
      draft: {
        ...item.draft,
        models: [],
      },
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED,
    }
  }

  if (canEditItemModels(item) && !isExecutablePreviewItem(item)) {
    return {
      ...item,
      draft: {
        ...item.draft,
        models,
      },
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      blockingReasonCode: undefined,
      blockingMessage: undefined,
    }
  }

  return {
    ...item,
    draft: {
      ...item.draft,
      models,
    },
  }
}

export const applyModelsToPreviewItem = (
  item: ManagedSiteTokenBatchExportPreviewItem,
  models: string[],
): ManagedSiteTokenBatchExportPreviewItem =>
  applyNormalizedModelsToPreviewItem(item, normalizeModels(models))

const hasDuplicateRiskWarning = (
  item: ManagedSiteTokenBatchExportPreviewItem,
) =>
  item.warningCodes.some(
    (code) =>
      code ===
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE ||
      code ===
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION,
  )

const hasExactVerificationUnavailableWarning = (
  item: ManagedSiteTokenBatchExportPreviewItem,
) =>
  item.warningCodes.includes(
    MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
  )

export const shouldSelectPreviewItemByDefault = (
  item: ManagedSiteTokenBatchExportPreviewItem,
) => isExecutablePreviewItem(item) && !hasDuplicateRiskWarning(item)

export const getPreviewItemVerificationCandidate = (
  item: ManagedSiteTokenBatchExportPreviewItem,
  siteType: ManagedSiteType,
): ManagedSiteTokenBatchExportMatchedChannel | undefined => {
  if (
    siteType !== SITE_TYPES.NEW_API ||
    !hasExactVerificationUnavailableWarning(item)
  ) {
    return undefined
  }

  return (
    item.verificationCandidate ??
    item.matchedChannel ??
    item.assessment?.url.channel ??
    item.assessment?.models.channel ??
    item.assessment?.key.channel
  )
}

export const getPreviewVerificationTargets = (
  preview: ManagedSiteTokenBatchExportPreview,
) =>
  preview.items.flatMap((item) => {
    const candidate = getPreviewItemVerificationCandidate(
      item,
      preview.siteType,
    )

    return candidate ? [{ item, candidate }] : []
  })

export const countPreviewItems = (
  items: ManagedSiteTokenBatchExportPreviewItem[],
) =>
  items.reduce(
    (accumulator, item) => {
      switch (item.status) {
        case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY:
          accumulator.readyCount += 1
          break
        case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING:
          accumulator.warningCount += 1
          break
        case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED:
          accumulator.skippedCount += 1
          break
        case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED:
          accumulator.blockedCount += 1
          break
      }

      return accumulator
    },
    {
      readyCount: 0,
      warningCount: 0,
      skippedCount: 0,
      blockedCount: 0,
    },
  )

const removeWarningCode = (
  codes: ManagedSiteTokenBatchExportWarningCode[],
  codeToRemove: ManagedSiteTokenBatchExportWarningCode,
): ManagedSiteTokenBatchExportWarningCode[] =>
  codes.filter((code) => code !== codeToRemove)

const addWarningCode = (
  codes: ManagedSiteTokenBatchExportWarningCode[],
  codeToAdd: ManagedSiteTokenBatchExportWarningCode,
): ManagedSiteTokenBatchExportWarningCode[] =>
  codes.includes(codeToAdd) ? codes : [...codes, codeToAdd]

export const applyResolvedChannelKeyToPreviewItem = (params: {
  item: ManagedSiteTokenBatchExportPreviewItem
  candidate: ManagedSiteTokenBatchExportMatchedChannel
  resolvedKey: string
  siteType?: ManagedSiteType
}): ManagedSiteTokenBatchExportPreviewItem => {
  const { item, candidate } = params
  const assessment = item.assessment
  const normalizedResolvedKey = params.resolvedKey.trim()
  const normalizedDraftKey = item.draft?.key.trim() ?? ""

  if (!assessment || !normalizedResolvedKey || !normalizedDraftKey) {
    return item
  }

  const applied = applyVerifiedManagedSiteChannelKey({
    assessment,
    candidate,
    sourceKey: normalizedDraftKey,
    verifiedChannelKey: normalizedResolvedKey,
    siteType: params.siteType,
  })
  const nextAssessment = applied.assessment

  if (applied.exactMatch) {
    return {
      ...item,
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
      warningCodes: removeWarningCode(
        item.warningCodes,
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
      ),
      matchedChannel: candidate,
      verificationCandidate: undefined,
      assessment: nextAssessment,
    }
  }

  let warningCodes = removeWarningCode(
    item.warningCodes,
    MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
  )

  if (applied.hasAnyMatch) {
    warningCodes = addWarningCode(
      warningCodes,
      MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION,
    )
  }

  return {
    ...item,
    status:
      warningCodes.length > 0
        ? MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING
        : MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
    warningCodes,
    matchedChannel: undefined,
    verificationCandidate: undefined,
    assessment: nextAssessment,
  }
}
