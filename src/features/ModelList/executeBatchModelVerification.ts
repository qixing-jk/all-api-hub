import {
  pickBatchVerifyCompatibleRuntimeKey,
  resolveBatchVerifyApiType,
  type BatchVerifyApiTypeMode,
  type BatchVerifyModelItem,
} from "~/features/ModelList/batchVerification"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import { collectAccountRuntimeKeySecrets } from "~/services/accounts/accountRuntimeKeys"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { resolveProductAnalyticsErrorCategoryFromError } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/verification"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  getApiVerificationProbeDefinitions,
  runApiVerificationProbe,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  buildSafeProbeFailureDiagnostics,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { createLogger } from "~/utils/core/logger"

import {
  BATCH_VERIFY_ROW_STATUSES,
  BATCH_VERIFY_ROW_SUMMARIES,
  deriveBatchVerifyRowStatus,
  filterRedactions,
  getBatchVerifyFailureLogIds,
  getFirstApplicableProbeId,
  getRowLatency,
  isAccountBatchVerifyModelItem,
  type BatchVerifyRow,
  type BatchVerifyRowStatus,
} from "./batchVerificationState"
import type { AccountBatchVerifyModelItem } from "./batchVerificationState"

type ExecutionContext = {
  apiTypeMode: BatchVerifyApiTypeMode
  verificationMode: ApiVerificationMode
  selectedProbeIds: ApiVerificationProbeId[]
  abortSignal: AbortSignal
  shouldStop: () => boolean
  getAccountRuntimeKeys: (
    item: AccountBatchVerifyModelItem,
  ) => Promise<AccountRuntimeKey[]>
  getResolvedRuntimeKey: (
    item: AccountBatchVerifyModelItem,
    key: AccountRuntimeKey,
    signal?: AbortSignal,
  ) => Promise<AccountRuntimeKey>
  persistResult: (
    item: BatchVerifyModelItem,
    apiType: ApiVerificationApiType,
    results: ApiVerificationProbeResult[],
  ) => Promise<void>
  recordFailureCategory: (
    category: ProductAnalyticsErrorCategory | undefined,
  ) => void
  publish: (patch: Partial<Omit<BatchVerifyRow, "item">>) => void
}

const logger = createLogger("BatchVerifyModelsDialog")

/** Execute one model against its source, accepting only complete, uncancelled results. */
export async function executeBatchModelVerification(
  item: BatchVerifyModelItem,
  {
    apiTypeMode,
    verificationMode,
    selectedProbeIds,
    abortSignal,
    shouldStop,
    getAccountRuntimeKeys,
    getResolvedRuntimeKey,
    persistResult,
    recordFailureCategory,
    publish,
  }: ExecutionContext,
): Promise<BatchVerifyRowStatus | undefined> {
  const isStopped = () => shouldStop() || abortSignal.aborted
  if (isStopped()) return undefined

  const startedAt = Date.now()
  publish({
    status: BATCH_VERIFY_ROW_STATUSES.RUNNING,
    latencyMs: 0,
    summary: BATCH_VERIFY_ROW_SUMMARIES.Running,
    results: [],
    runtimeKeyName: undefined,
    errorCategory: undefined,
  })

  let apiKey = ""
  let accountRuntimeKeySecretsToRedact: string[] = []
  const apiType = resolveBatchVerifyApiType(apiTypeMode, item.modelId)
  const selectedProbeIdSet = new Set(selectedProbeIds)

  try {
    const credentials =
      item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
        ? {
            baseUrl: item.source.profile.baseUrl,
            apiKey: item.source.profile.apiKey,
            requestHeaders: item.source.profile.requestHeaders,
            runtimeKeyName: undefined,
          }
        : await (async () => {
            if (!isAccountBatchVerifyModelItem(item)) return null
            const account = item.source.account
            const runtimeKeys = await getAccountRuntimeKeys(item)
            if (isStopped()) return null

            const runtimeKey = pickBatchVerifyCompatibleRuntimeKey(
              runtimeKeys,
              item,
            )
            if (!runtimeKey) {
              publish({
                status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
                latencyMs: 0,
                summary: BATCH_VERIFY_ROW_SUMMARIES.NoKey,
                results: [],
              })
              return null
            }

            accountRuntimeKeySecretsToRedact = collectAccountRuntimeKeySecrets([
              runtimeKey,
            ])
            const resolvedRuntimeKey = await getResolvedRuntimeKey(
              item,
              runtimeKey,
              abortSignal,
            )
            if (isStopped()) return null
            accountRuntimeKeySecretsToRedact = collectAccountRuntimeKeySecrets([
              runtimeKey,
              resolvedRuntimeKey,
            ])

            return {
              baseUrl: resolvedRuntimeKey.baseUrl || account.baseUrl,
              apiKey: resolvedRuntimeKey.secret,
              runtimeKeyName: runtimeKey.label,
            }
          })()

    if (!credentials || isStopped()) {
      return isStopped() ? undefined : BATCH_VERIFY_ROW_STATUSES.SKIPPED
    }

    apiKey = credentials.apiKey
    const probesToRun = getApiVerificationProbeDefinitions(apiType).filter(
      (probe) =>
        selectedProbeIdSet.has(probe.id) &&
        (!probe.requiresModelId || item.modelId.trim()),
    )

    if (probesToRun.length === 0) {
      publish({
        status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
        latencyMs: 0,
        summary: BATCH_VERIFY_ROW_SUMMARIES.NoProbes,
        results: [],
        runtimeKeyName: credentials.runtimeKeyName,
      })
      return BATCH_VERIFY_ROW_STATUSES.SKIPPED
    }

    const results: ApiVerificationProbeResult[] = []
    let stoppedBeforeCompletingProbes = false
    for (const probe of probesToRun) {
      if (isStopped()) {
        stoppedBeforeCompletingProbes = true
        break
      }

      try {
        const result = await runApiVerificationProbe({
          baseUrl: credentials.baseUrl,
          apiKey: credentials.apiKey,
          requestHeaders:
            item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
              ? item.source.profile.requestHeaders
              : undefined,
          apiType,
          mode: verificationMode,
          modelId: item.modelId,
          probeId: probe.id,
          abortSignal,
        })
        if (isStopped()) {
          stoppedBeforeCompletingProbes = true
          break
        }
        results.push(result)
      } catch (error) {
        if (isStopped()) {
          stoppedBeforeCompletingProbes = true
          break
        }

        const redactions =
          item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
            ? filterRedactions([
                item.source.profile.apiKey,
                ...Object.values(item.source.profile.requestHeaders ?? {}),
                item.source.profile.baseUrl,
              ])
            : filterRedactions([
                item.source.account.token,
                item.source.account.cookieAuthSessionCookie,
                apiKey,
              ])

        const sanitizedMessage = toSanitizedErrorSummary(error, redactions)
        const diagnostics = buildSafeProbeFailureDiagnostics(
          error,
          sanitizedMessage,
        )
        results.push({
          id: probe.id,
          mode:
            probe.id === API_VERIFICATION_PROBE_IDS.Models
              ? undefined
              : verificationMode,
          status: API_VERIFICATION_PROBE_STATUSES.Fail,
          latencyMs: 0,
          summary: sanitizedMessage || "Unexpected error",
          ...diagnostics,
          summaryKey:
            diagnostics.summaryKey ??
            (sanitizedMessage ? undefined : "verifyDialog.errors.unexpected"),
        })
      }
    }

    if (stoppedBeforeCompletingProbes || isStopped()) return undefined

    await persistResult(item, apiType, results).catch((persistError) => {
      logger.error("Failed to persist batch verification result", {
        modelId: item.modelId,
        message: toSanitizedErrorSummary(persistError, [apiKey]),
      })
    })

    const status = deriveBatchVerifyRowStatus(results)
    const errorCategory =
      status === BATCH_VERIFY_ROW_STATUSES.FAIL
        ? results
            .filter(
              (result) =>
                result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
            )
            .map((result) =>
              resolveProductAnalyticsErrorCategoryFromProbeResult(result),
            )
            .find(
              (category) =>
                category !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            ) ?? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
        : undefined
    recordFailureCategory(errorCategory)
    publish({
      status,
      latencyMs: getRowLatency(results),
      summary: BATCH_VERIFY_ROW_SUMMARIES.Results,
      results,
      runtimeKeyName: credentials.runtimeKeyName,
      errorCategory,
    })
    return status
  } catch (error) {
    if (isStopped()) return undefined

    const redactions =
      item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
        ? filterRedactions([
            item.source.profile.apiKey,
            ...Object.values(item.source.profile.requestHeaders ?? {}),
            item.source.profile.baseUrl,
          ])
        : filterRedactions([
            item.source.account.token,
            item.source.account.cookieAuthSessionCookie,
            apiKey,
            ...accountRuntimeKeySecretsToRedact,
          ])
    const message = toSanitizedErrorSummary(error, redactions)

    logger.error("Batch model verification failed", {
      ...getBatchVerifyFailureLogIds(item),
      modelId: item.modelId,
      message,
    })

    const diagnostics = buildSafeProbeFailureDiagnostics(error, message)
    const probeId = getFirstApplicableProbeId(apiType, selectedProbeIds)
    const result: ApiVerificationProbeResult = {
      id: probeId,
      mode:
        probeId === API_VERIFICATION_PROBE_IDS.Models
          ? undefined
          : verificationMode,
      status: BATCH_VERIFY_ROW_STATUSES.FAIL,
      latencyMs: Date.now() - startedAt,
      summary: message || "Unexpected error",
      ...diagnostics,
      summaryKey:
        diagnostics.summaryKey ??
        (message ? undefined : "verifyDialog.errors.unexpected"),
    }
    const errorCategory = resolveProductAnalyticsErrorCategoryFromError(error)
    recordFailureCategory(errorCategory)
    await persistResult(item, apiType, [result]).catch((persistError) => {
      logger.error("Failed to persist batch verification failure", {
        modelId: item.modelId,
        message: toSanitizedErrorSummary(persistError, redactions),
      })
    })
    publish({
      status: BATCH_VERIFY_ROW_STATUSES.FAIL,
      latencyMs: result.latencyMs,
      summary: BATCH_VERIFY_ROW_SUMMARIES.Failed,
      results: [result],
      errorCategory,
    })
    return BATCH_VERIFY_ROW_STATUSES.FAIL
  }
}
