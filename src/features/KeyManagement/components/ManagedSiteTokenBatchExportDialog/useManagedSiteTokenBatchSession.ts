import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  PREVIEW_LOAD_ORIGINS,
  type PreviewLoadOrigin,
} from "~/constants/previewLoadOrigin"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import {
  MANAGED_SITE_TOKEN_BATCH_IMPORT_TARGET_CHANGED_ERROR_CODE,
  ManagedSiteTokenBatchImportTargetChangedError,
  prepareManagedSiteTokenBatchExportPreview,
} from "~/services/managedSites/tokenBatchExport"
import {
  createAutomaticProtectionBypassExecution,
  withProtectionBypassUserCommand,
} from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type {
  ManagedSiteBatchImportIntent,
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportItemInput,
  ManagedSiteTokenBatchExportMatchedChannel,
  ManagedSiteTokenBatchExportPreview,
  ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem as isExecutablePreviewItem,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
} from "~/types/managedSiteTokenBatchExport"
import { getErrorMessage } from "~/utils/core/error"

import {
  applyNormalizedModelsToPreviewItem,
  applyResolvedChannelKeyToPreviewItem,
  countPreviewItems,
  normalizeModels,
  toModelOptions,
} from "../managedSiteTokenBatchExportPreview"
import {
  getManagedSiteTokenBatchExportRetryItemIds,
  mergeManagedSiteTokenBatchExportExecutionResults,
  reconcileManagedSiteTokenBatchExportPreview,
} from "./managedSiteTokenBatchExportSession"

/** Owns one batch-import session, including preview edits, invalidation and retry results. */
export function useManagedSiteTokenBatchSession({
  isOpen,
  items,
  intent,
  managedSiteConfigFingerprint,
  isVerificationDialogOpen,
  closeVerificationDialog,
}: {
  isOpen: boolean
  items: ManagedSiteTokenBatchExportItemInput[]
  intent: ManagedSiteBatchImportIntent
  managedSiteConfigFingerprint: string
  isVerificationDialogOpen: boolean
  closeVerificationDialog: () => void
}) {
  const [preview, setPreview] =
    useState<ManagedSiteTokenBatchExportPreview | null>(null)
  const [activeIntent, setActiveIntent] =
    useState<ManagedSiteBatchImportIntent>(intent)
  const [intentWorkflowIsOpen, setIntentWorkflowIsOpen] = useState(isOpen)
  if (intentWorkflowIsOpen !== isOpen) {
    setIntentWorkflowIsOpen(isOpen)
    if (isOpen) {
      setActiveIntent(intent)
    }
  }
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editedModelsByItemId, setEditedModelsByItemId] = useState<
    Map<string, string[]>
  >(new Map())
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewLoadOrigin, setPreviewLoadOrigin] =
    useState<PreviewLoadOrigin>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [executionFailure, setExecutionError] = useState<
    | { kind: "target-changed" }
    | { kind: "verification" | "upstream"; message: string }
    | null
  >(null)
  const [isTargetChanged, setIsTargetChanged] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [executionResult, setExecutionResult] =
    useState<ManagedSiteTokenBatchExportExecutionResult | null>(null)
  const [retryItemIds, setRetryItemIds] = useState<Set<string>>(new Set())
  const [refreshKey, setRefreshKey] = useState(0)
  const [verifyingItemId, setVerifyingItemId] = useState<string | null>(null)
  const workflowEpochCounterRef = useRef(0)
  const activeWorkflowEpochRef = useRef<number | null>(null)
  const resolvedChannelKeysByItemIdRef = useRef<
    Record<string, Record<string, string>>
  >({})
  const previewRef = useRef<ManagedSiteTokenBatchExportPreview | null>(null)
  const selectedIdsRef = useRef<Set<string>>(new Set())
  const editedModelsByItemIdRef = useRef<Map<string, string[]>>(new Map())
  const retryBaselineRef =
    useRef<ManagedSiteTokenBatchExportExecutionResult | null>(null)
  const latestItemsRef = useRef(items)
  const openedItemsRef = useRef(items)
  const wasOpenRef = useRef(false)
  const pendingPreviewLoadOriginRef = useRef<PreviewLoadOrigin>(null)
  const managedSiteConfigFingerprintRef = useRef(managedSiteConfigFingerprint)

  useLayoutEffect(() => {
    previewRef.current = preview
    selectedIdsRef.current = selectedIds
    editedModelsByItemIdRef.current = editedModelsByItemId
    latestItemsRef.current = items
  }, [editedModelsByItemId, items, preview, selectedIds])

  useEffect(() => {
    if (!isOpen) {
      setActiveIntent(intent)
    }
  }, [intent, isOpen])

  useLayoutEffect(() => {
    if (
      managedSiteConfigFingerprintRef.current !== managedSiteConfigFingerprint
    ) {
      managedSiteConfigFingerprintRef.current = managedSiteConfigFingerprint
      resolvedChannelKeysByItemIdRef.current = {}
      previewRef.current = null
      selectedIdsRef.current = new Set()
      editedModelsByItemIdRef.current = new Map()
      retryBaselineRef.current = null
      pendingPreviewLoadOriginRef.current = null
      setPreview(null)
      setSelectedIds(new Set())
      setEditedModelsByItemId(new Map())
      setPreviewError(null)
      setExecutionError(null)
      setIsTargetChanged(false)
      setIsConfirmOpen(false)
      setIsRunning(false)
      setExecutionResult(null)
      setRetryItemIds(new Set())
      setVerifyingItemId(null)
      setIsLoadingPreview(isOpen)
      closeVerificationDialog()
    }

    if (!isOpen) {
      activeWorkflowEpochRef.current = null
      return
    }

    const ownedEpoch = workflowEpochCounterRef.current + 1
    workflowEpochCounterRef.current = ownedEpoch
    activeWorkflowEpochRef.current = ownedEpoch

    return () => {
      if (activeWorkflowEpochRef.current === ownedEpoch) {
        activeWorkflowEpochRef.current = null
      }
    }
  }, [closeVerificationDialog, isOpen, managedSiteConfigFingerprint])

  const isCurrentWorkflow = useCallback(
    (epoch: number | null) =>
      epoch !== null && activeWorkflowEpochRef.current === epoch,
    [],
  )

  useEffect(() => {
    if (!isOpen && isVerificationDialogOpen) {
      closeVerificationDialog()
    }
  }, [closeVerificationDialog, isOpen, isVerificationDialogOpen])

  useEffect(() => {
    if (!isOpen) {
      setPreview(null)
      setSelectedIds(new Set())
      setEditedModelsByItemId(new Map())
      setIsLoadingPreview(false)
      setPreviewLoadOrigin(null)
      setPreviewError(null)
      setExecutionError(null)
      setIsTargetChanged(false)
      setIsConfirmOpen(false)
      setIsRunning(false)
      setExecutionResult(null)
      setRetryItemIds(new Set())
      setRefreshKey(0)
      setVerifyingItemId(null)
      wasOpenRef.current = false
      pendingPreviewLoadOriginRef.current = null
      resolvedChannelKeysByItemIdRef.current = {}
      retryBaselineRef.current = null
      return
    }

    if (!wasOpenRef.current) {
      openedItemsRef.current = latestItemsRef.current
      wasOpenRef.current = true
    }

    let cancelled = false
    const requestOrigin =
      pendingPreviewLoadOriginRef.current ?? PREVIEW_LOAD_ORIGINS.AUTOMATIC
    pendingPreviewLoadOriginRef.current = null
    setPreviewLoadOrigin(requestOrigin)
    if (requestOrigin === PREVIEW_LOAD_ORIGINS.AUTOMATIC) {
      setPreview(null)
      setSelectedIds(new Set())
      setEditedModelsByItemId(new Map())
    }
    setPreviewError(null)
    setExecutionError(null)
    setIsTargetChanged(false)
    setExecutionResult(null)
    setIsLoadingPreview(true)
    const previewWorkflowEpoch = activeWorkflowEpochRef.current

    void (async () => {
      try {
        const preparePreview = (
          protectionBypassExecution: Parameters<
            typeof prepareManagedSiteTokenBatchExportPreview
          >[0]["protectionBypassExecution"],
        ) =>
          prepareManagedSiteTokenBatchExportPreview({
            items: openedItemsRef.current,
            intent: activeIntent,
            resolvedChannelKeysByItemId: resolvedChannelKeysByItemIdRef.current,
            protectionBypassExecution,
          })
        const nextPreview =
          requestOrigin === PREVIEW_LOAD_ORIGINS.MANUAL
            ? await withProtectionBypassUserCommand(
                PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
                PROTECTION_BYPASS_SURFACES.Options,
                preparePreview,
              )
            : await preparePreview(
                createAutomaticProtectionBypassExecution(
                  PROTECTION_BYPASS_FEATURES.KeyManagement,
                  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
                  PROTECTION_BYPASS_SURFACES.Options,
                ),
              )
        if (cancelled || !isCurrentWorkflow(previewWorkflowEpoch)) return
        const reconciled = reconcileManagedSiteTokenBatchExportPreview({
          previousPreview: previewRef.current,
          nextPreview,
          selectedIds: selectedIdsRef.current,
          editedModelsByItemId: editedModelsByItemIdRef.current,
        })
        setPreview(reconciled.preview)
        setSelectedIds(reconciled.selectedIds)
      } catch (error) {
        if (cancelled || !isCurrentWorkflow(previewWorkflowEpoch)) return
        setPreviewError(getErrorMessage(error))
      } finally {
        if (!cancelled && isCurrentWorkflow(previewWorkflowEpoch)) {
          setIsLoadingPreview(false)
          setPreviewLoadOrigin(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    activeIntent,
    isCurrentWorkflow,
    isOpen,
    managedSiteConfigFingerprint,
    refreshKey,
  ])

  const executableItems = useMemo(
    () => preview?.items.filter(isExecutablePreviewItem) ?? [],
    [preview],
  )
  const selectedExecutableCount = executableItems.filter((item) =>
    selectedIds.has(item.id),
  ).length
  const allExecutableSelected =
    executableItems.length > 0 &&
    selectedExecutableCount === executableItems.length
  const executableSelectionChecked: boolean | "indeterminate" =
    selectedExecutableCount === 0
      ? false
      : selectedExecutableCount === executableItems.length
        ? true
        : "indeterminate"

  const selectedExecutionIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  )
  const modelOptions = useMemo(
    () =>
      toModelOptions(
        normalizeModels(
          preview?.items.flatMap((item) => item.draft?.models ?? []) ?? [],
        ),
      ),
    [preview],
  )

  const handleRefreshPreview = () => {
    if (
      isLoadingPreview ||
      pendingPreviewLoadOriginRef.current ||
      isRunning ||
      verifyingItemId
    ) {
      return
    }
    if (isVerificationDialogOpen) return
    pendingPreviewLoadOriginRef.current = PREVIEW_LOAD_ORIGINS.MANUAL
    setPreviewLoadOrigin(PREVIEW_LOAD_ORIGINS.MANUAL)
    setIsLoadingPreview(true)
    setExecutionError(null)
    setIsTargetChanged(false)
    setRefreshKey((value) => value + 1)
  }

  const handleRetryPreview = () => {
    handleRefreshPreview()
    if (pendingPreviewLoadOriginRef.current === PREVIEW_LOAD_ORIGINS.MANUAL) {
      setPreviewError(null)
      setPreview(null)
    }
  }

  const handleUseCompleteChecks = () => {
    if (
      activeIntent.source !==
        MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED ||
      activeIntent.verification !==
        MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW ||
      isLoadingPreview ||
      isRunning ||
      verifyingItemId ||
      isVerificationDialogOpen
    ) {
      return
    }

    pendingPreviewLoadOriginRef.current = PREVIEW_LOAD_ORIGINS.MANUAL
    setActiveIntent({
      source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
      verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    })
    setPreviewLoadOrigin(PREVIEW_LOAD_ORIGINS.MANUAL)
    setExecutionError(null)
    setIsTargetChanged(false)
    setIsLoadingPreview(true)
    setRefreshKey((value) => value + 1)
  }

  const handleRetry = () => {
    if (
      !executionResult ||
      isRunning ||
      isLoadingPreview ||
      verifyingItemId ||
      isVerificationDialogOpen
    ) {
      return
    }

    const nextRetryItemIds =
      getManagedSiteTokenBatchExportRetryItemIds(executionResult)
    if (nextRetryItemIds.length === 0) return

    retryBaselineRef.current = executionResult
    setRetryItemIds(new Set(nextRetryItemIds))
    setSelectedIds(new Set(nextRetryItemIds))
    setExecutionResult(null)
    setActiveIntent({
      source: activeIntent.source,
      verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    })
    pendingPreviewLoadOriginRef.current = PREVIEW_LOAD_ORIGINS.MANUAL
    setPreviewLoadOrigin(PREVIEW_LOAD_ORIGINS.MANUAL)
    setPreviewError(null)
    setExecutionError(null)
    setIsTargetChanged(false)
    setIsLoadingPreview(true)
    setRefreshKey((value) => value + 1)
  }

  const mergeResolvedChannelKeyForItem = (
    itemId: string,
    resourceRef: ManagedResourceRef,
    key: string,
  ) => {
    resolvedChannelKeysByItemIdRef.current = {
      ...resolvedChannelKeysByItemIdRef.current,
      [itemId]: {
        ...(resolvedChannelKeysByItemIdRef.current[itemId] ?? {}),
        [getManagedResourceRefKey(resourceRef)]: key,
      },
    }
  }

  const applyResolvedChannelKeyForItem = (
    item: ManagedSiteTokenBatchExportPreviewItem,
    candidate: ManagedSiteTokenBatchExportMatchedChannel,
    resolvedKey: string,
  ) => {
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview

      const nextItems = currentPreview.items.map((previewItem) =>
        previewItem.id === item.id
          ? applyResolvedChannelKeyToPreviewItem({
              item: previewItem,
              candidate,
              resolvedKey,
              siteType: currentPreview.siteType,
            })
          : previewItem,
      )

      return {
        ...currentPreview,
        items: nextItems,
        ...countPreviewItems(nextItems),
      }
    })
    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(currentSelectedIds)
      const currentPreviewItem =
        previewRef.current?.items.find(
          (previewItem) => previewItem.id === item.id,
        ) ?? item
      const updatedItem = applyResolvedChannelKeyToPreviewItem({
        item: currentPreviewItem,
        candidate,
        resolvedKey,
        siteType: previewRef.current?.siteType,
      })

      if (
        updatedItem.status ===
        MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED
      ) {
        nextSelectedIds.delete(item.id)
      }

      return nextSelectedIds
    })
  }

  const handleToggleAll = () => {
    if (!preview || executionResult || isRunning) return
    setSelectedIds(
      allExecutableSelected
        ? new Set()
        : new Set(executableItems.map((item) => item.id)),
    )
  }

  const handleToggleItem = (item: ManagedSiteTokenBatchExportPreviewItem) => {
    if (!isExecutablePreviewItem(item) || executionResult || isRunning) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      return next
    })
  }

  const handleItemModelsChange = (
    item: ManagedSiteTokenBatchExportPreviewItem,
    models: string[],
  ) => {
    if (!item.draft || executionResult || isRunning) return

    const normalizedModels = normalizeModels(models)

    setEditedModelsByItemId((currentEditedModels) => {
      const nextEditedModels = new Map(currentEditedModels)
      nextEditedModels.set(item.id, normalizedModels)
      return nextEditedModels
    })

    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview

      const nextItems = currentPreview.items.map((previewItem) =>
        previewItem.id === item.id && previewItem.draft
          ? applyNormalizedModelsToPreviewItem(previewItem, normalizedModels)
          : previewItem,
      )

      return {
        ...currentPreview,
        items: nextItems,
        ...countPreviewItems(nextItems),
      }
    })

    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(currentSelectedIds)
      if (normalizedModels.length === 0) {
        nextSelectedIds.delete(item.id)
      } else if (
        item.status ===
          MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED &&
        item.blockingReasonCode ===
          MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED
      ) {
        nextSelectedIds.add(item.id)
      }
      return nextSelectedIds
    })
  }

  const captureWorkflow = () => {
    const epoch = activeWorkflowEpochRef.current
    return () => isCurrentWorkflow(epoch)
  }
  const beginExecution = () => {
    setIsConfirmOpen(false)
    setIsRunning(true)
    setExecutionError(null)
    setIsTargetChanged(false)
  }
  const completeExecution = (
    result: ManagedSiteTokenBatchExportExecutionResult,
  ) => {
    const cumulativeResult = mergeManagedSiteTokenBatchExportExecutionResults(
      retryBaselineRef.current,
      result,
      retryItemIds,
    )
    retryBaselineRef.current = null
    setRetryItemIds(new Set())
    setExecutionResult(cumulativeResult)
    return cumulativeResult
  }
  const failExecution = (error: unknown) => {
    const targetChanged =
      error instanceof ManagedSiteTokenBatchImportTargetChangedError ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code ===
          MANAGED_SITE_TOKEN_BATCH_IMPORT_TARGET_CHANGED_ERROR_CODE)
    setIsTargetChanged(targetChanged)
    setExecutionError(
      targetChanged
        ? { kind: "target-changed" }
        : { kind: "upstream", message: getErrorMessage(error) },
    )
    if (retryBaselineRef.current) {
      setExecutionResult(retryBaselineRef.current)
      retryBaselineRef.current = null
      setRetryItemIds(new Set())
    }
  }
  return {
    preview,
    activeIntent,
    selectedIds,
    modelOptions,
    previewError,
    executionFailure,
    isTargetChanged,
    isLoadingPreview,
    previewLoadOrigin,
    isRunning,
    executionResult,
    retryItemIds,
    isConfirmOpen,
    verifyingItemId,
    selectedExecutionIds,
    executableItems,
    selectedExecutableCount,
    executableSelectionChecked,
    captureWorkflow,
    beginExecution,
    completeExecution,
    failExecution,
    finishExecution: () => setIsRunning(false),
    showConfirmation: () => setIsConfirmOpen(true),
    closeConfirmation: () => setIsConfirmOpen(false),
    setVerificationProgress: setVerifyingItemId,
    setVerificationFailure: (message: string | null) =>
      setExecutionError(
        message === null ? null : { kind: "verification", message },
      ),
    resolveChannelKey: (
      item: ManagedSiteTokenBatchExportPreviewItem,
      candidate: ManagedSiteTokenBatchExportMatchedChannel,
      key: string,
    ) => {
      mergeResolvedChannelKeyForItem(item.id, candidate.ref, key)
      applyResolvedChannelKeyForItem(item, candidate, key)
    },
    handleRefreshPreview,
    handleRetryPreview,
    handleUseCompleteChecks,
    handleRetry,
    handleToggleAll,
    handleToggleItem,
    handleItemModelsChange,
  }
}
