import { SITE_TYPES } from "~/constants/siteType"
import {
  accountRuntimeKeyToLegacyAccountToken,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  openNativeManagedChannelImportSession,
  validateNativeManagedChannelImportDraft,
} from "~/services/apiAdapters/managedResources/channelImport"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import {
  getManagedSiteChannelExactMatch,
  getRecoverableManagedSiteChannelCandidate,
  type ManagedSiteChannelMatchInspection,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  toPrivateManagedSiteMutationOutput,
  toPrivateManagedSiteThrownErrorMessage,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import {
  createManagedSiteOperationContext,
  type ManagedSiteOperationContext,
} from "~/services/managedSites/operationContext"
import {
  getCurrentManagedSiteRuntimeConfig,
  getCurrentManagedSiteType,
  type ManagedSiteRuntimeConfigValue,
} from "~/services/managedSites/runtimeConfig"
import {
  createManagedSiteTokenBatchImportTarget,
  type ManagedSiteTokenBatchImportTarget,
} from "~/services/managedSites/tokenBatchImportTarget"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import {
  collectManagedResourceSecrets,
  mergeManagedResourceSecretCollections,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import {
  toManagedSiteAssessmentChannel,
  toManagedSiteVerifiedKeyAssessment,
} from "~/services/managedSites/verifiedChannelKeyAssessment"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { AccountToken } from "~/types"
import type { ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem,
  isResolvedManagedSiteTokenBatchExportItemInput,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
  type ExecutableManagedSiteTokenBatchExportPreviewItem,
  type ManagedSiteBatchImportIntent,
  type ManagedSiteTokenBatchExportBlockedReasonCode,
  type ManagedSiteTokenBatchExportExecutionItem,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportItemInput,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
  type ManagedSiteTokenBatchExportWarningCode,
  type ResolvedManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ManagedSiteTokenBatchExport")

const TOKEN_BATCH_EXPORT_CONCURRENCY = 4
const FALLBACK_BLOCKING_MESSAGE = "Failed to prepare this key for batch import"
const FALLBACK_EXECUTION_ERROR = "Failed to create channel"
const DEFINITE_NATIVE_IMPORT_FAILURE_CODES: ReadonlySet<
  ResourceFailure["code"]
> = new Set([
  MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
  MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
  MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
  MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
  MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
  MANAGED_RESOURCE_FAILURE_CODES.NotFound,
  MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
])

const isDefiniteNativeImportFailure = (error: unknown) =>
  error instanceof ManagedResourceError &&
  DEFINITE_NATIVE_IMPORT_FAILURE_CODES.has(error.failure.code)
export const MANAGED_SITE_TOKEN_BATCH_IMPORT_TARGET_CHANGED_ERROR_CODE =
  "managed-site-token-import-target-changed" as const

export const DEFAULT_MANAGED_SITE_TOKEN_BATCH_IMPORT_INTENT: ManagedSiteBatchImportIntent =
  {
    source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.MANUAL_SELECTION,
    verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
  }

export class ManagedSiteTokenBatchImportTargetChangedError extends Error {
  readonly code = MANAGED_SITE_TOKEN_BATCH_IMPORT_TARGET_CHANGED_ERROR_CODE

  constructor() {
    super("The managed-site target changed. Review the target and try again.")
    this.name = "ManagedSiteTokenBatchImportTargetChangedError"
  }
}

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  if (items.length === 0) {
    return []
  }

  const results = new Array<TResult>(items.length)
  let nextIndex = 0
  let hasFailure = false
  let firstFailure: unknown

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        if (hasFailure) return
        const index = nextIndex
        nextIndex += 1

        if (index >= items.length) {
          return
        }

        try {
          results[index] = await mapper(items[index], index)
        } catch (error) {
          if (!hasFailure) {
            hasFailure = true
            firstFailure = error
          }
          return
        }
      }
    },
  )

  await Promise.all(workers)
  if (hasFailure) throw firstFailure

  return results
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
  if (managedSite.siteType !== SITE_TYPES.NEW_API) {
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
  if (!isAccountTokenRuntimeKey(input.runtimeKey)) {
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

const resolveInputTokenForManagedSiteExport = async (
  input: ResolvedManagedSiteTokenBatchExportItemInput,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<AccountToken> =>
  accountRuntimeKeyToLegacyAccountToken(
    await resolveInputRuntimeKeyForManagedSiteExport(
      input,
      protectionBypassExecution,
    ),
  )

const resolveInputAccountForManagedSiteExport = (
  input: ResolvedManagedSiteTokenBatchExportItemInput,
) => {
  const runtimeKeyBaseUrl = input.runtimeKey.baseUrl.trim()
  const baseUrl = isAccountTokenRuntimeKey(input.runtimeKey)
    ? normalizeManagedSiteChannelBaseUrl(
        runtimeKeyBaseUrl || input.account.baseUrl,
      )
    : runtimeKeyBaseUrl ||
      normalizeManagedSiteChannelBaseUrl(input.account.baseUrl)

  return {
    ...input.account,
    baseUrl,
  }
}

const preparePreviewItem = async (params: {
  input: ResolvedManagedSiteTokenBatchExportItemInput
  managedSite: ManagedSiteCapabilities
  managedConfig: ManagedSiteRuntimeConfigValue
  verification: ManagedSiteBatchImportIntent["verification"]
  resolvedChannelKeysById?: Record<number, string>
  operationContext?: ManagedSiteOperationContext
  protectionBypassExecution?: ProtectionBypassExecution
}): Promise<ManagedSiteTokenBatchExportPreviewItem> => {
  const { input, managedSite, managedConfig } = params
  let secretCollection = collectManagedResourceSecrets(input, managedConfig)

  let resolvedToken: AccountToken

  try {
    resolvedToken = await resolveInputTokenForManagedSiteExport(
      input,
      params.protectionBypassExecution,
    )
    secretCollection = mergeManagedResourceSecretCollections(
      secretCollection,
      collectManagedResourceSecrets(resolvedToken),
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
    const channelDraftAccount = resolveInputAccountForManagedSiteExport(input)
    const draft = await managedSite.channelDrafts.prepareFormData(
      channelDraftAccount,
      resolvedToken,
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
      resolvedChannelKeysById: params.resolvedChannelKeysById,
      resolveHiddenKeys: true,
      requestCache: params.operationContext?.channelMatch,
      protectionBypassExecution: params.protectionBypassExecution,
    })
    const exactMatch = getManagedSiteChannelExactMatch(
      resolution,
      managedSite.siteType,
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
  resolvedChannelKeysByItemId?: Record<string, Record<number, string>>
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
  const items = await mapWithConcurrency(
    params.items,
    TOKEN_BATCH_EXPORT_CONCURRENCY,
    (input) => {
      if (!isResolvedManagedSiteTokenBatchExportItemInput(input)) {
        return Promise.resolve(buildExplicitBlockedPreviewItem(input))
      }

      return preparePreviewItem({
        input,
        managedSite: target.managedSite,
        managedConfig: target.config,
        verification: intent.verification,
        resolvedChannelKeysById:
          params.resolvedChannelKeysByItemId?.[getInputRuntimeKeyId(input)],
        operationContext,
        protectionBypassExecution: params.protectionBypassExecution,
      })
    },
  )

  return buildPreview(
    { intent, siteType: target.managedSite.siteType, target },
    items,
  )
}

/**
 * Creates target managed-site channels for selected executable preview rows
 * and returns per-token execution results without mutating source accounts.
 */
export async function executeManagedSiteTokenBatchExport(params: {
  preview: ManagedSiteTokenBatchExportPreview
  selectedItemIds: string[]
}): Promise<ManagedSiteTokenBatchExportExecutionResult> {
  const runtimeConfig = await getCurrentManagedSiteRuntimeConfig()
  if (!runtimeConfig) {
    throw new ManagedSiteTokenBatchImportTargetChangedError()
  }

  const target = await createManagedSiteTokenBatchImportTarget(runtimeConfig)
  if (
    !params.preview.targetFingerprint ||
    target.targetFingerprint !== params.preview.targetFingerprint
  ) {
    throw new ManagedSiteTokenBatchImportTargetChangedError()
  }

  const selectedIds = new Set(params.selectedItemIds)
  const selectedPreviewItems = params.preview.items.filter((item) =>
    selectedIds.has(item.id),
  )
  const isSelectedExecutablePreviewItem = (
    item: ManagedSiteTokenBatchExportPreviewItem,
  ): item is ExecutableManagedSiteTokenBatchExportPreviewItem =>
    selectedIds.has(item.id) &&
    isExecutableManagedSiteTokenBatchExportPreviewItem(item)
  const executableItems = params.preview.items.filter(
    isSelectedExecutablePreviewItem,
  )
  const nativeImportSessionResult = executableItems.length
    ? await openNativeManagedChannelImportSession(
        target.managedSite.siteType,
      ).then(
        (session) => ({ session, error: null }),
        (error: unknown) => ({ session: null, error }),
      )
    : { session: null, error: null }
  let executedItems: ManagedSiteTokenBatchExportExecutionItem[]
  try {
    executedItems = await mapWithConcurrency(
      executableItems,
      TOKEN_BATCH_EXPORT_CONCURRENCY,
      async (item): Promise<ManagedSiteTokenBatchExportExecutionItem> => {
        const preDispatchSecretCollection = collectManagedResourceSecrets(
          target.config,
          item.draft,
        )
        if (
          nativeImportSessionResult.error ||
          !nativeImportSessionResult.session
        ) {
          const message = preDispatchSecretCollection.complete
            ? toPrivateManagedSiteThrownErrorMessage(
                nativeImportSessionResult.error,
                { knownSecrets: preDispatchSecretCollection.knownSecrets },
              )
            : undefined
          return {
            id: item.id,
            accountName: item.accountName,
            runtimeKeyName: item.runtimeKeyName,
            result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
            success: false,
            skipped: false,
            error: message
              ? `${FALLBACK_EXECUTION_ERROR}: ${message}`
              : FALLBACK_EXECUTION_ERROR,
          }
        }
        const secretCollection = preDispatchSecretCollection
        let mutation: ManagedSiteMutationResult<unknown>
        {
          try {
            mutation = await nativeImportSessionResult.session.submit(
              item.draft,
            )
          } catch (error) {
            const message = secretCollection.complete
              ? toPrivateManagedSiteThrownErrorMessage(error, {
                  knownSecrets: secretCollection.knownSecrets,
                })
              : undefined
            return {
              id: item.id,
              accountName: item.accountName,
              runtimeKeyName: item.runtimeKeyName,
              result: isDefiniteNativeImportFailure(error)
                ? MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED
                : MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
              success: false,
              skipped: false,
              error: message
                ? `${FALLBACK_EXECUTION_ERROR}: ${message}`
                : FALLBACK_EXECUTION_ERROR,
            }
          }
        }
        assertManagedSiteMutationResult(mutation, { idempotent: false })
        const privateOutput = secretCollection.complete
          ? toPrivateManagedSiteMutationOutput(mutation, {
              knownSecrets: secretCollection.knownSecrets,
            })
          : null
        const privateError = (() => {
          const details = [
            privateOutput?.statusCode
              ? `HTTP ${privateOutput.statusCode}`
              : null,
            privateOutput?.code !== undefined
              ? String(privateOutput.code)
              : null,
          ].filter((detail): detail is string => Boolean(detail))
          const fallback =
            details.length > 0
              ? `${FALLBACK_EXECUTION_ERROR} (${details.join(", ")})`
              : FALLBACK_EXECUTION_ERROR

          return privateOutput?.message
            ? `${fallback}: ${privateOutput.message}`
            : fallback
        })()

        switch (mutation.outcome) {
          case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
            return {
              id: item.id,
              accountName: item.accountName,
              runtimeKeyName: item.runtimeKeyName,
              result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
              success: true,
              skipped: false,
            }
          case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
            return {
              id: item.id,
              accountName: item.accountName,
              runtimeKeyName: item.runtimeKeyName,
              result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
              success: false,
              skipped: false,
              error: privateError,
            }
          case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
          case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
            return {
              id: item.id,
              accountName: item.accountName,
              runtimeKeyName: item.runtimeKeyName,
              result:
                MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
              success: false,
              skipped: false,
              error: privateError,
            }
        }
      },
    )
  } catch (error) {
    try {
      await nativeImportSessionResult.session?.reconcile()
    } catch {
      // Reconciliation is best effort; post-invocation failures stay non-replayable.
    }
    throw error
  }

  if (
    executedItems.some(
      (item) =>
        item.result ===
        MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
    )
  ) {
    try {
      await nativeImportSessionResult.session?.reconcile()
    } catch {
      // Reconciliation is best effort; ambiguous creates remain non-replayable.
    }
  }

  const createdCount = executedItems.filter(
    (item) =>
      item.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
  ).length
  const failedCount = executedItems.filter(
    (item) =>
      item.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
  ).length
  const uncertainCount = executedItems.filter(
    (item) =>
      item.result ===
      MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
  ).length
  const skippedCount = selectedPreviewItems.length - executableItems.length

  return {
    totalSelected: selectedPreviewItems.length,
    attemptedCount: executableItems.length,
    createdCount,
    failedCount,
    uncertainCount,
    skippedCount,
    items: executedItems,
  }
}
