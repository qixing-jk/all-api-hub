import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  MODEL_LIST_BATCH_VERIFY_CONCURRENCY,
  pickBatchVerifyCompatibleRuntimeKey,
  resolveBatchVerifyApiType,
  type BatchVerifyApiTypeMode,
  type BatchVerifyModelItem,
} from "~/features/ModelList/batchVerification"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import { collectAccountRuntimeKeySecrets } from "~/services/accounts/accountRuntimeKeys"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/verification"
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  getApiVerificationProbeDefinitions,
  runApiVerificationProbe,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  buildSafeProbeFailureDiagnostics,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { createLogger } from "~/utils/core/logger"

import {
  BATCH_VERIFY_ROW_STATUSES,
  buildRows,
  DEFAULT_SELECTED_PROBE_IDS,
  deriveBatchVerifyRowStatus,
  filterRedactions,
  getBatchVerifyFailureLogIds,
  getDefaultApiTypeMode,
  getFirstApplicableProbeId,
  getRowLatency,
  isAccountBatchVerifyModelItem,
  isCompletedStatus,
  type BatchVerifyRow,
  type BatchVerifyRowStatus,
} from "../batchVerificationState"
import { useBatchVerificationHistory } from "./useBatchVerificationHistory"
import { useBatchVerificationRuntimeKeys } from "./useBatchVerificationRuntimeKeys"

const logger = createLogger("BatchVerifyModelsDialog")
/** Own the selection snapshot and cancellable run behind the batch verification view. */
export function useBatchVerifyModels({
  isOpen,
  items,
}: {
  isOpen: boolean
  items: BatchVerifyModelItem[]
}) {
  const [rows, setRows] = useState<BatchVerifyRow[]>(() => buildRows(items))
  const [verificationMode, setVerificationMode] = useState<ApiVerificationMode>(
    API_VERIFICATION_MODES.Streaming,
  )
  const [apiTypeMode, setApiTypeMode] = useState<BatchVerifyApiTypeMode>(() =>
    getDefaultApiTypeMode(items),
  )
  const [selectedProbeIds, setSelectedProbeIds] = useState<
    ApiVerificationProbeId[]
  >(DEFAULT_SELECTED_PROBE_IDS)
  const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>(() =>
    items.map((item) => item.key),
  )
  const [isRunning, setIsRunning] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const shouldStopRef = useRef(false)
  const batchAbortControllerRef = useRef<AbortController | null>(null)
  const batchFailureCategoryRef = useRef<
    ProductAnalyticsErrorCategory | undefined
  >(undefined)
  const previousDialogSnapshotRef = useRef({
    isOpen: false,
    items,
  })
  const {
    getAccountRuntimeKeys,
    getResolvedRuntimeKey,
    clearCachedRuntimeKeyPromises,
  } = useBatchVerificationRuntimeKeys()
  const { persistResult, flushPendingResults } = useBatchVerificationHistory()
  useEffect(() => {
    const previousSnapshot = previousDialogSnapshotRef.current

    if (!isOpen) {
      previousDialogSnapshotRef.current = { isOpen, items }
      return
    }

    const opened = !previousSnapshot.isOpen
    const itemsChanged = previousSnapshot.items !== items
    if (!opened && !itemsChanged) return
    if (isRunning) return

    previousDialogSnapshotRef.current = { isOpen, items }
    shouldStopRef.current = false
    clearCachedRuntimeKeyPromises()
    setRows(buildRows(items))
    setApiTypeMode(getDefaultApiTypeMode(items))
    setVerificationMode(API_VERIFICATION_MODES.Streaming)
    setSelectedProbeIds(DEFAULT_SELECTED_PROBE_IDS)
    setSelectedModelKeys(items.map((item) => item.key))
    setIsRunning(false)
    setHasStarted(false)
  }, [clearCachedRuntimeKeyPromises, isOpen, isRunning, items])

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.PASS) acc.pass += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.FAIL) acc.fail += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.SKIPPED) acc.skipped += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.RUNNING) acc.running += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.PENDING) acc.pending += 1
        if (isCompletedStatus(row.status)) acc.completed += 1
        return acc
      },
      {
        total: 0,
        completed: 0,
        pass: 0,
        fail: 0,
        skipped: 0,
        running: 0,
        pending: 0,
      },
    )
  }, [rows])

  const canClose = !isRunning
  const selectedModelKeySet = useMemo(
    () => new Set(selectedModelKeys),
    [selectedModelKeys],
  )
  const canStart = selectedModelKeys.length > 0 && selectedProbeIds.length > 0
  const areAllModelsSelected =
    items.length > 0 && selectedModelKeys.length === items.length

  const updateRow = useCallback(
    (key: string, patch: Partial<Omit<BatchVerifyRow, "item">>) => {
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.item.key === key ? { ...row, ...patch } : row,
        ),
      )
    },
    [],
  )

  const toggleProbe = useCallback((probeId: ApiVerificationProbeId) => {
    setSelectedProbeIds((currentProbeIds) =>
      currentProbeIds.includes(probeId)
        ? currentProbeIds.filter((currentProbeId) => currentProbeId !== probeId)
        : [...currentProbeIds, probeId],
    )
  }, [])

  const toggleModel = useCallback((modelKey: string) => {
    setSelectedModelKeys((currentModelKeys) =>
      currentModelKeys.includes(modelKey)
        ? currentModelKeys.filter(
            (currentModelKey) => currentModelKey !== modelKey,
          )
        : [...currentModelKeys, modelKey],
    )
  }, [])

  const selectAllModels = useCallback(() => {
    setSelectedModelKeys(items.map((item) => item.key))
  }, [items])

  const clearSelectedModels = useCallback(() => {
    setSelectedModelKeys([])
  }, [])

  const runOne = useCallback(
    async (item: BatchVerifyModelItem, abortSignal: AbortSignal) => {
      const isStopped = () => shouldStopRef.current || abortSignal.aborted
      if (isStopped()) return undefined

      const startedAt = Date.now()
      updateRow(item.key, {
        status: BATCH_VERIFY_ROW_STATUSES.RUNNING,
        latencyMs: 0,
        summary: "running",
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
                  updateRow(item.key, {
                    status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
                    latencyMs: 0,
                    summary: "no-key",
                    results: [],
                  })
                  return null
                }

                accountRuntimeKeySecretsToRedact =
                  collectAccountRuntimeKeySecrets([runtimeKey])
                const resolvedRuntimeKey = await getResolvedRuntimeKey(
                  item,
                  runtimeKey,
                  abortSignal,
                )
                if (isStopped()) return null
                accountRuntimeKeySecretsToRedact =
                  collectAccountRuntimeKeySecrets([
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
          updateRow(item.key, {
            status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
            latencyMs: 0,
            summary: "no-probes",
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
                (sanitizedMessage
                  ? undefined
                  : "verifyDialog.errors.unexpected"),
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
        if (
          errorCategory &&
          errorCategory !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
        ) {
          batchFailureCategoryRef.current ??= errorCategory
        }
        updateRow(item.key, {
          status,
          latencyMs: getRowLatency(results),
          summary: "results",
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
        const errorCategory =
          resolveProductAnalyticsErrorCategoryFromError(error)
        if (errorCategory !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown) {
          batchFailureCategoryRef.current ??= errorCategory
        }
        await persistResult(item, apiType, [result]).catch((persistError) => {
          logger.error("Failed to persist batch verification failure", {
            modelId: item.modelId,
            message: toSanitizedErrorSummary(persistError, redactions),
          })
        })
        updateRow(item.key, {
          status: BATCH_VERIFY_ROW_STATUSES.FAIL,
          latencyMs: result.latencyMs,
          summary: "failed",
          results: [result],
          errorCategory,
        })
        return BATCH_VERIFY_ROW_STATUSES.FAIL
      }
    },
    [
      apiTypeMode,
      verificationMode,
      getAccountRuntimeKeys,
      getResolvedRuntimeKey,
      persistResult,
      selectedProbeIds,
      updateRow,
    ],
  )

  const markUnfinishedRowsStopped = useCallback(() => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.status === BATCH_VERIFY_ROW_STATUSES.PENDING ||
        row.status === BATCH_VERIFY_ROW_STATUSES.RUNNING
          ? {
              ...row,
              status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
              summary: "stopped" as const,
              results: [],
            }
          : row,
      ),
    )
  }, [])

  const runBatch = async () => {
    if (isRunning || !canStart) return

    const selectedItems = items.filter((item) =>
      selectedModelKeySet.has(item.key),
    )
    shouldStopRef.current = false
    clearCachedRuntimeKeyPromises()
    const abortController = new AbortController()
    batchAbortControllerRef.current = abortController
    batchFailureCategoryRef.current = undefined
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.StartBatchModelVerify,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListBatchVerifyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    setHasStarted(true)
    setIsRunning(true)
    setRows(
      buildRows(items).map((row) =>
        selectedModelKeySet.has(row.item.key)
          ? row
          : {
              ...row,
              status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
              summary: "not-selected",
            },
      ),
    )

    let nextIndex = 0
    const selectedOutcomes: BatchVerifyRowStatus[] = []
    const workerCount = Math.min(
      MODEL_LIST_BATCH_VERIFY_CONCURRENCY,
      selectedItems.length,
    )

    const worker = async () => {
      while (!shouldStopRef.current) {
        const index = nextIndex
        nextIndex += 1
        const item = selectedItems[index]
        if (!item) return
        const outcome = await runOne(item, abortController.signal)
        if (outcome) {
          selectedOutcomes.push(outcome)
        }
      }
    }

    try {
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          await worker()
        }),
      )
    } finally {
      if (shouldStopRef.current) {
        markUnfinishedRowsStopped()
      }
      // Flush the last partial batch on every exit path, including stop and
      // failure, so completed results always reach storage.
      await flushPendingResults()
      if (batchAbortControllerRef.current === abortController) {
        batchAbortControllerRef.current = null
      }
      setIsRunning(false)
      const completionInsights = {
        itemCount: selectedItems.length,
        successCount: selectedOutcomes.filter(
          (outcome) => outcome === BATCH_VERIFY_ROW_STATUSES.PASS,
        ).length,
        failureCount: selectedOutcomes.filter(
          (outcome) => outcome === BATCH_VERIFY_ROW_STATUSES.FAIL,
        ).length,
      }
      if (shouldStopRef.current) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
      } else if (
        selectedOutcomes.some(
          (outcome) => outcome === BATCH_VERIFY_ROW_STATUSES.FAIL,
        )
      ) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory:
            batchFailureCategoryRef.current ??
            PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: completionInsights,
        })
      } else if (
        selectedOutcomes.every(
          (outcome) => outcome === BATCH_VERIFY_ROW_STATUSES.SKIPPED,
        )
      ) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: completionInsights,
        })
      }
    }
  }

  const stopBatch = () => {
    shouldStopRef.current = true
    batchAbortControllerRef.current?.abort()
  }

  return {
    rows,
    selectedModelKeys,
    verificationMode,
    setVerificationMode,
    apiTypeMode,
    setApiTypeMode,
    selectedProbeIds,
    selectedModelKeySet,
    isRunning,
    hasStarted,
    summary,
    canClose,
    canStart,
    areAllModelsSelected,
    toggleProbe,
    toggleModel,
    selectAllModels,
    clearSelectedModels,
    runBatch,
    stopBatch,
  }
}
