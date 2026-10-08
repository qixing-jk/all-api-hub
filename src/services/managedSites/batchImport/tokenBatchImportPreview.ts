import {
  isAccountKeyResourceRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/keys/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { type ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { validateNativeManagedChannelImportDraft } from "~/services/apiAdapters/managedResources/channelImport"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { mapBatchImportWithConcurrency } from "~/services/managedSites/batchImport/tokenBatchImportConcurrency"
import {
  createManagedSiteTokenBatchImportTarget,
  type ManagedSiteTokenBatchImportTarget,
} from "~/services/managedSites/batchImport/tokenBatchImportTarget"
import { buildManagedSiteChannelDraftSource } from "~/services/managedSites/configuration/channelDraftSource"
import {
  getCurrentManagedSiteRuntimeConfig,
  getCurrentManagedSiteType,
  type ManagedSiteRuntimeConfigValue,
} from "~/services/managedSites/configuration/runtimeConfig"
import {
  getManagedSiteChannelExactMatch,
  getRecoverableManagedSiteChannelCandidate,
  type ManagedSiteChannelMatchInspection,
} from "~/services/managedSites/matching/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/matching/channelMatchResolver"
import {
  toManagedSiteAssessmentChannel,
  toManagedSiteVerifiedKeyAssessment,
} from "~/services/managedSites/matching/verifiedChannelKeyAssessment"
import {
  createManagedSiteOperationContext,
  type ManagedSiteOperationContext,
} from "~/services/managedSites/operationContext"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import {
  collectManagedResourceSecrets,
  mergeManagedResourceSecretCollections,
} from "~/services/managedSites/utils/resourceSecrets"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"
import {
  isResolvedManagedSiteTokenBatchExportItemInput,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
  type ManagedSiteBatchImportIntent,
  type ManagedSiteTokenBatchExportBlockedReasonCode,
  type ManagedSiteTokenBatchExportItemInput,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
  type ManagedSiteTokenBatchExportWarningCode,
  type ResolvedManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ManagedSiteTokenBatchExport")

const FALLBACK_BLOCKING_MESSAGE = "Failed to prepare this key for batch import"

export const DEFAULT_MANAGED_SITE_TOKEN_BATCH_IMPORT_INTENT: ManagedSiteBatchImportIntent =
  {
    source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.MANUAL_SELECTION,
    verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
  }

const getInputRuntimeKeyId = (
  input: ResolvedManagedSiteTokenBatchExportItemInput,
) => input.runtimeKey.id

const getInputRuntimeKeyName = (
  input: ResolvedManagedSiteTokenBatchExportItemInput,
) => input.runtimeKey.label

const getVerificationCandidate = (
  managedSite: ManagedSiteCapabilities,
  resolution: ManagedSiteChannelMatchInspection,
) => {
  if (!managedSite.matching.secretVerification) {
    return undefined
  }

  const candidate = getRecoverableManagedSiteChannelCandidate({
    url: {
      channel: resolution.url.channel,
      candidateCount: resolution.url.candidateCount,
    },
    models: {
      channel: resolution.models.channel,
      reason: resolution.models.reason,
    },
  })

  return candidate ? toManagedSiteAssessmentChannel(candidate) : undefined
}

const buildBasePreviewItem = (
  input: ResolvedManagedSiteTokenBatchExportItemInput,
): Pick<
  ManagedSiteTokenBatchExportPreviewItem,
  "id" | "accountId" | "accountName" | "runtimeKeyId" | "runtimeKeyName"
> => ({
  id: getInputRuntimeKeyId(input),
  accountId: input.account.id,
  accountName:
    input.account.name || input.runtimeKey.accountName || input.account.id,
  runtimeKeyId: input.runtimeKey.id,
  runtimeKeyName: getInputRuntimeKeyName(input),
})

const buildBlockedPreviewItem = (
  input: ResolvedManagedSiteTokenBatchExportItemInput,
  reason: ManagedSiteTokenBatchExportBlockedReasonCode,
  blockingMessage?: string,
): ManagedSiteTokenBatchExportPreviewItem => ({
  ...buildBasePreviewItem(input),
  draft: null,
  status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
  warningCodes: [],
  blockingReasonCode: reason,
  blockingMessage,
})

const buildExplicitBlockedPreviewItem = (
  input: Exclude<
    ManagedSiteTokenBatchExportItemInput,
    ResolvedManagedSiteTokenBatchExportItemInput
  >,
): ManagedSiteTokenBatchExportPreviewItem => ({
  id: input.id,
  accountId: input.id,
  accountName: input.accountLabel,
  runtimeKeyId: input.id,
  runtimeKeyName: input.keyLabel,
  draft: null,
  status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
  warningCodes: [],
  blockingReasonCode: input.blockingReasonCode,
  blockingDetailCode: input.blockingDetailCode,
})

const uniqueWarningCodes = (
  warnings: ManagedSiteTokenBatchExportWarningCode[],
) => Array.from(new Set(warnings))

const isExactVerificationUnavailable = (
  resolution: Awaited<ReturnType<typeof resolveManagedSiteChannelMatch>>,
) => resolution.url.matched && !resolution.key.comparable

const getDraftBlockedReason = (
  managedSite: ManagedSiteCapabilities,
  draft: ManagedSiteChannelDraft,
): ManagedSiteTokenBatchExportBlockedReasonCode | null => {
  if (draft.modelPrefillFetchFailed && draft.models.length === 0) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED
  }
  const validation = validateNativeManagedChannelImportDraft(
    managedSite.siteType,
    draft,
  )
  if (validation.valid) return null

  const invalidFields = new Set(validation.issues.map((issue) => issue.fieldId))
  if (invalidFields.has("name") && !draft.name.trim()) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.NAME_REQUIRED
  }
  if (invalidFields.has("credential")) {
    return draft.key.trim()
      ? MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.REAL_KEY_REQUIRED
      : MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.KEY_REQUIRED
  }
  if (invalidFields.has("baseUrl") && !draft.base_url.trim()) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED
  }
  if (invalidFields.has("models") && draft.models.length === 0) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED
  }
  return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED
}

type ManagedResourceSecretCollection = ReturnType<
  typeof collectManagedResourceSecrets
>

const toSafePreviewDiagnostic = (
  error: unknown,
  secretCollection: ManagedResourceSecretCollection,
) =>
  secretCollection.complete
    ? toSanitizedErrorSummary(error, [...secretCollection.knownSecrets])
    : ""

const resolveInputRuntimeKeyForManagedSiteExport = async (
  input: ResolvedManagedSiteTokenBatchExportItemInput,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<AccountRuntimeKey> => {
  if (!isAccountKeyResourceRuntimeKey(input.runtimeKey)) {
    return input.runtimeKey
  }

  return resolveDisplayAccountRuntimeKeySecret(
    input.account,
    input.runtimeKey,
    {
      protectionBypassExecution,
    },
  )
}

const buildInputDraftSource = (
  input: ResolvedManagedSiteTokenBatchExportItemInput,
  runtimeKey: AccountRuntimeKey,
) => {
  const runtimeKeyBaseUrl = runtimeKey.baseUrl.trim()
  const baseUrl =
    isAccountKeyResourceRuntimeKey(runtimeKey) &&
    runtimeKeyBaseUrl === input.account.baseUrl.trim()
      ? normalizeManagedSiteChannelBaseUrl(
          runtimeKeyBaseUrl || input.account.baseUrl,
        )
      : runtimeKeyBaseUrl ||
        normalizeManagedSiteChannelBaseUrl(input.account.baseUrl)

  return buildManagedSiteChannelDraftSource({
    ...runtimeKey,
    baseUrl,
  })
}

const preparePreviewItem = async (params: {
  input: ResolvedManagedSiteTokenBatchExportItemInput
  managedSite: ManagedSiteCapabilities
  managedConfig: ManagedSiteRuntimeConfigValue
  verification: ManagedSiteBatchImportIntent["verification"]
  resolvedChannelKeysByResourceKey?: Record<string, string>
  operationContext?: ManagedSiteOperationContext
  protectionBypassExecution?: ProtectionBypassExecution
}): Promise<ManagedSiteTokenBatchExportPreviewItem> => {
  const { input, managedSite, managedConfig } = params
  let secretCollection = collectManagedResourceSecrets(input, managedConfig)

  let resolvedRuntimeKey: AccountRuntimeKey

  try {
    resolvedRuntimeKey = await resolveInputRuntimeKeyForManagedSiteExport(
      input,
      params.protectionBypassExecution,
    )
    secretCollection = mergeManagedResourceSecretCollections(
      secretCollection,
      collectManagedResourceSecrets(resolvedRuntimeKey),
    )
  } catch (error) {
    const diagnostic = toSafePreviewDiagnostic(error, secretCollection)
    logger.warn("Managed-site token batch secret resolution failed", {
      accountId: input.account.id,
      runtimeKeyId: input.runtimeKey.id,
      runtimeKeySource: input.runtimeKey.source,
      siteType: managedSite.siteType,
      diagnostic,
    })

    return buildBlockedPreviewItem(
      input,
      MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED,
      diagnostic || FALLBACK_BLOCKING_MESSAGE,
    )
  }

  try {
    const draft = await managedSite.channelDrafts.prepareFormData(
      buildInputDraftSource(input, resolvedRuntimeKey),
      {
        operationContext: params.operationContext,
      },
    )
    secretCollection = mergeManagedResourceSecretCollections(
      secretCollection,
      collectManagedResourceSecrets(draft),
    )
    const blockedReason = getDraftBlockedReason(managedSite, draft)

    if (blockedReason) {
      return {
        ...buildBasePreviewItem(input),
        draft,
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
        warningCodes: [],
        blockingReasonCode: blockedReason,
      }
    }

    const warningCodes: ManagedSiteTokenBatchExportWarningCode[] = []
    if (draft.modelPrefillFetchFailed) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MODEL_PREFILL_FAILED,
      )
    }

    if (
      params.verification ===
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW
    ) {
      return {
        ...buildBasePreviewItem(input),
        draft,
        status:
          warningCodes.length > 0
            ? MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING
            : MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
        warningCodes: uniqueWarningCodes(warningCodes),
      }
    }

    if (!supportsManagedSiteBaseUrlChannelLookup(managedSite.siteType)) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.DEDUPE_UNSUPPORTED,
      )

      return {
        ...buildBasePreviewItem(input),
        draft,
        status:
          warningCodes.length > 0
            ? MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING
            : MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
        warningCodes: uniqueWarningCodes(warningCodes),
      }
    }

    const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(draft.base_url)
    const resolution = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: searchBaseUrl,
      models: draft.models,
      key: draft.key,
      resolvedChannelKeysByResourceKey: params.resolvedChannelKeysByResourceKey,
      resolveHiddenKeys: true,
      requestCache: params.operationContext?.channelMatch,
      protectionBypassExecution: params.protectionBypassExecution,
    })
    const exactMatch = getManagedSiteChannelExactMatch(
      resolution,
      managedSite.matching,
    )
    const assessment = toManagedSiteVerifiedKeyAssessment(resolution)
    const verificationCandidate = getVerificationCandidate(
      managedSite,
      resolution,
    )
    const exactVerificationUnavailable =
      isExactVerificationUnavailable(resolution)

    if (exactMatch) {
      return {
        ...buildBasePreviewItem(input),
        draft,
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
        warningCodes: uniqueWarningCodes(warningCodes),
        matchedChannel: toManagedSiteAssessmentChannel(exactMatch),
        assessment,
      }
    }

    if (!resolution.searchCompleted) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.BACKEND_SEARCH_FAILED,
      )
    } else if (exactVerificationUnavailable) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
      )
    } else if (
      resolution.url.matched ||
      resolution.key.matched ||
      resolution.models.matched
    ) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION,
      )
    }

    return {
      ...buildBasePreviewItem(input),
      draft,
      status:
        warningCodes.length > 0
          ? MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING
          : MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      warningCodes: uniqueWarningCodes(warningCodes),
      assessment,
      ...(verificationCandidate ? { verificationCandidate } : {}),
    }
  } catch (error) {
    const diagnostic = toSafePreviewDiagnostic(error, secretCollection)
    logger.warn("Managed-site token batch preview item failed", {
      accountId: input.account.id,
      runtimeKeyId: input.runtimeKey.id,
      runtimeKeySource: input.runtimeKey.source,
      siteType: managedSite.siteType,
      diagnostic,
    })

    return buildBlockedPreviewItem(
      input,
      MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
      diagnostic || FALLBACK_BLOCKING_MESSAGE,
    )
  }
}

const buildPreview = (
  params: {
    intent: ManagedSiteBatchImportIntent
    siteType: ManagedSiteCapabilities["siteType"]
    target: ManagedSiteTokenBatchImportTarget | null
  },
  items: ManagedSiteTokenBatchExportPreviewItem[],
): ManagedSiteTokenBatchExportPreview => {
  const counts = items.reduce(
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

  return {
    intent: params.intent,
    siteType: params.siteType,
    targetFingerprint: params.target?.targetFingerprint ?? null,
    targetSummary: params.target?.targetSummary ?? null,
    items,
    totalCount: items.length,
    ...counts,
  }
}

/**
 * Builds a non-mutating preview for creating selected account tokens as
 * channels in the currently selected managed site.
 */
export async function prepareManagedSiteTokenBatchExportPreview(params: {
  items: ManagedSiteTokenBatchExportItemInput[]
  intent?: ManagedSiteBatchImportIntent
  resolvedChannelKeysByItemId?: Record<string, Record<string, string>>
  protectionBypassExecution?: ProtectionBypassExecution
}): Promise<ManagedSiteTokenBatchExportPreview> {
  const intent = params.intent ?? DEFAULT_MANAGED_SITE_TOKEN_BATCH_IMPORT_INTENT
  const runtimeConfig = await getCurrentManagedSiteRuntimeConfig()

  if (!runtimeConfig) {
    const managedSite = getManagedSiteCapabilities(
      await getCurrentManagedSiteType(),
    )
    return buildPreview(
      { intent, siteType: managedSite.siteType, target: null },
      params.items.map((input) =>
        isResolvedManagedSiteTokenBatchExportItemInput(input)
          ? buildBlockedPreviewItem(
              input,
              MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING,
            )
          : buildExplicitBlockedPreviewItem(input),
      ),
    )
  }

  const target = await createManagedSiteTokenBatchImportTarget(runtimeConfig)
  const operationContext = createManagedSiteOperationContext()
  const items = await mapBatchImportWithConcurrency(params.items, (input) => {
    if (!isResolvedManagedSiteTokenBatchExportItemInput(input)) {
      return Promise.resolve(buildExplicitBlockedPreviewItem(input))
    }

    return preparePreviewItem({
      input,
      managedSite: target.managedSite,
      managedConfig: target.config,
      verification: intent.verification,
      resolvedChannelKeysByResourceKey:
        params.resolvedChannelKeysByItemId?.[getInputRuntimeKeyId(input)],
      operationContext,
      protectionBypassExecution: params.protectionBypassExecution,
    })
  })

  return buildPreview(
    { intent, siteType: target.managedSite.siteType, target },
    items,
  )
}
