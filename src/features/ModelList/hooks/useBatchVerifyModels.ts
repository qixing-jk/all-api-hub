import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  MODEL_LIST_BATCH_VERIFY_CONCURRENCY,
  type BatchVerifyApiTypeMode,
  type BatchVerifyModelItem,
} from "~/features/ModelList/verification/batchVerification"
import {
  BATCH_VERIFY_ROW_STATUSES,
  BATCH_VERIFY_ROW_SUMMARIES,
  buildRows,
  DEFAULT_SELECTED_PROBE_IDS,
  getDefaultApiTypeMode,
  isCompletedStatus,
  type BatchVerifyRow,
  type BatchVerifyRowStatus,
} from "~/features/ModelList/verification/batchVerificationState"
import { executeBatchModelVerification } from "~/features/ModelList/verification/executeBatchModelVerification"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"
import {
  API_VERIFICATION_MODES,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
} from "~/services/verification/aiApiVerification"

import { useBatchVerificationHistory } from "./useBatchVerificationHistory"
import { useBatchVerificationRuntimeKeys } from "./useBatchVerificationRuntimeKeys"

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
    (item: BatchVerifyModelItem, abortSignal: AbortSignal) =>
      executeBatchModelVerification(item, {
        apiTypeMode,
        verificationMode,
        selectedProbeIds,
        abortSignal,
        shouldStop: () => shouldStopRef.current,
        getAccountRuntimeKeys,
        getResolvedRuntimeKey,
        persistResult,
        recordFailureCategory: (errorCategory) => {
          if (
            errorCategory &&
            errorCategory !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
          ) {
            batchFailureCategoryRef.current ??= errorCategory
          }
        },
        publish: (patch) => updateRow(item.key, patch),
      }),
    [
      apiTypeMode,
      verificationMode,
      selectedProbeIds,
      getAccountRuntimeKeys,
      getResolvedRuntimeKey,
      persistResult,
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
              summary: BATCH_VERIFY_ROW_SUMMARIES.Stopped,
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
              summary: BATCH_VERIFY_ROW_SUMMARIES.NotSelected,
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
