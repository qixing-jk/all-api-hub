import type { TFunction } from "i18next"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import toast from "react-hot-toast"

import {
  PREVIEW_LOAD_ORIGINS,
  type PreviewLoadOrigin,
} from "~/constants/previewLoadOrigin"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import {
  NEW_API_MANAGED_VERIFICATION_CLOSE_MODES,
  useNewApiManagedVerification,
} from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import {
  executeManagedSiteTokenBatchExport,
  prepareManagedSiteTokenBatchExportPreview,
} from "~/services/managedSites/tokenBatchExport"
import {
  trackProductAnalyticsActionCompleted,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
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
} from "~/types/managedSiteTokenBatchExport"
import { getErrorMessage } from "~/utils/core/error"

import {
  applyNormalizedModelsToPreviewItem,
  applyResolvedChannelKeyToPreviewItem,
  countPreviewItems,
  getPreviewVerificationTargets,
  normalizeModels,
  shouldSelectPreviewItemByDefault,
  toModelOptions,
} from "../managedSiteTokenBatchExportPreview"

export interface ManagedSiteTokenBatchExportDialogProps {
  isOpen: boolean
  onClose: () => void
  items: ManagedSiteTokenBatchExportItemInput[]
  onCompleted?: (result: ManagedSiteTokenBatchExportExecutionResult) => void
}

interface UseManagedSiteTokenBatchExportDialogParams
  extends ManagedSiteTokenBatchExportDialogProps {
  t: TFunction
}

const getBatchExportAnalyticsContext = () => ({
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportManagedSiteTokenChannels,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
})

/**
 * Builds the workflow state and view actions for the token batch export dialog.
 */
export function useManagedSiteTokenBatchExportDialog({
  isOpen,
  onClose,
  items,
  onCompleted,
  t,
}: UseManagedSiteTokenBatchExportDialogParams) {
  const {
    newApiBaseUrl,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
  } = useUserPreferencesContext()
  const verification = useNewApiManagedVerification()
  const isVerificationDialogOpen = verification.dialogState.isOpen
  const closeVerificationDialog = verification.closeDialog
  const [preview, setPreview] =
    useState<ManagedSiteTokenBatchExportPreview | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewLoadOrigin, setPreviewLoadOrigin] =
    useState<PreviewLoadOrigin>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [executionResult, setExecutionResult] =
    useState<ManagedSiteTokenBatchExportExecutionResult | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [verifyingItemId, setVerifyingItemId] = useState<string | null>(null)
  const workflowEpochCounterRef = useRef(0)
  const activeWorkflowEpochRef = useRef<number | null>(null)
  const resolvedChannelKeysByItemIdRef = useRef<
    Record<string, Record<number, string>>
  >({})
  const previewRef = useRef<ManagedSiteTokenBatchExportPreview | null>(null)
  const latestItemsRef = useRef(items)
  const openedItemsRef = useRef(items)
  const wasOpenRef = useRef(false)
  const pendingPreviewLoadOriginRef = useRef<PreviewLoadOrigin>(null)

  previewRef.current = preview
  latestItemsRef.current = items

  useLayoutEffect(() => {
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
  }, [isOpen])

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
      setIsLoadingPreview(false)
      setPreviewLoadOrigin(null)
      setPreviewError(null)
      setExecutionError(null)
      setIsConfirmOpen(false)
      setIsRunning(false)
      setExecutionResult(null)
      setRefreshKey(0)
      setVerifyingItemId(null)
      wasOpenRef.current = false
      pendingPreviewLoadOriginRef.current = null
      resolvedChannelKeysByItemIdRef.current = {}
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
    }
    setPreviewError(null)
    setExecutionError(null)
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
        setPreview(nextPreview)
        setSelectedIds(
          new Set(
            nextPreview.items
              .filter(shouldSelectPreviewItemByDefault)
              .map((item) => item.id),
          ),
        )
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
  }, [isCurrentWorkflow, isOpen, refreshKey])

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

  const handleClose = () => {
    if (isRunning) return
    if (verification.dialogState.isOpen) {
      verification.closeDialog()
    }
    onClose()
  }

  const handleRefreshPreview = () => {
    if (
      isLoadingPreview ||
      pendingPreviewLoadOriginRef.current ||
      isRunning ||
      verifyingItemId
    ) {
      return
    }
    if (verification.dialogState.isOpen) return
    pendingPreviewLoadOriginRef.current = PREVIEW_LOAD_ORIGINS.MANUAL
    setPreviewLoadOrigin(PREVIEW_LOAD_ORIGINS.MANUAL)
    setIsLoadingPreview(true)
    setExecutionError(null)
    setRefreshKey((value) => value + 1)
  }

  const handleRetryPreview = () => {
    handleRefreshPreview()
    if (pendingPreviewLoadOriginRef.current === PREVIEW_LOAD_ORIGINS.MANUAL) {
      setPreviewError(null)
      setPreview(null)
    }
  }

  const mergeResolvedChannelKeyForItem = (
    itemId: string,
    channelId: number,
    key: string,
  ) => {
    resolvedChannelKeysByItemIdRef.current = {
      ...resolvedChannelKeysByItemIdRef.current,
      [itemId]: {
        ...(resolvedChannelKeysByItemIdRef.current[itemId] ?? {}),
        [channelId]: key,
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

  const handleVerifyAndRefresh = async (
    requestedItem: ManagedSiteTokenBatchExportPreviewItem,
    requestedCandidate: ManagedSiteTokenBatchExportMatchedChannel,
  ) => {
    const verificationWorkflowEpoch = activeWorkflowEpochRef.current
    const isActive = () => isCurrentWorkflow(verificationWorkflowEpoch)
    if (
      !isActive() ||
      !preview ||
      verifyingItemId ||
      verification.dialogState.isOpen ||
      isLoadingPreview ||
      isRunning
    ) {
      return
    }

    const verificationTargets = getPreviewVerificationTargets(preview)
    const targets =
      verificationTargets.length > 0
        ? verificationTargets
        : [{ item: requestedItem, candidate: requestedCandidate }]
    const failureMessages: string[] = []

    setExecutionError(null)

    const verifyTargetsFromIndex = async (startIndex: number) => {
      for (let index = startIndex; index < targets.length; index += 1) {
        if (!isActive()) return

        const { item, candidate } = targets[index]
        let resolvedChannelKey = ""
        let shouldContinueAfterDeferredLoad = false
        let loadCompleted = false

        setVerifyingItemId(item.id)

        const handleLoaded = async () => {
          if (!isActive()) return

          loadCompleted = true
          if (resolvedChannelKey) {
            mergeResolvedChannelKeyForItem(
              item.id,
              candidate.id,
              resolvedChannelKey,
            )
            applyResolvedChannelKeyForItem(item, candidate, resolvedChannelKey)
          }
          setExecutionError(null)
          if (shouldContinueAfterDeferredLoad && isActive()) {
            await verifyTargetsFromIndex(index + 1)
          }
        }

        try {
          const loadedImmediately = await loadNewApiChannelKeyWithVerification({
            channelId: candidate.id,
            command: PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
            label: candidate.name,
            requestKind: "channel",
            config: {
              baseUrl: newApiBaseUrl,
              userId: newApiUserId,
              username: newApiUsername,
              password: newApiPassword,
              totpSecret: newApiTotpSecret,
            },
            setKey: (key) => {
              if (!isActive()) return
              resolvedChannelKey = key
            },
            onLoaded: handleLoaded,
            openVerification: (request) => {
              if (!isActive()) return
              verification.openNewApiManagedVerification({
                ...request,
                closeMode:
                  NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_VERIFICATION,
              })
            },
          })

          if (!isActive()) return
          if (!loadedImmediately) {
            if (!loadCompleted) {
              shouldContinueAfterDeferredLoad = true
              setVerifyingItemId(null)
              return
            }
          }
        } catch (error) {
          if (!isActive()) return
          failureMessages.push(getErrorMessage(error))
        }
      }

      if (!isActive()) return
      setVerifyingItemId(null)
      if (failureMessages.length > 0) {
        setExecutionError(
          t(
            "keyManagement:batchManagedSiteExport.messages.verificationFailed",
            {
              error: failureMessages.join("; "),
            },
          ),
        )
      }
    }

    try {
      await verifyTargetsFromIndex(0)
    } catch (error) {
      if (!isActive()) return
      setVerifyingItemId(null)
      setExecutionError(
        t("keyManagement:batchManagedSiteExport.messages.verificationFailed", {
          error: getErrorMessage(error),
        }),
      )
    }
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

  const handleConfirm = async () => {
    const confirmationWorkflowEpoch = activeWorkflowEpochRef.current
    if (
      !isCurrentWorkflow(confirmationWorkflowEpoch) ||
      !preview ||
      selectedExecutionIds.length === 0
    ) {
      return
    }

    setIsConfirmOpen(false)
    setIsRunning(true)
    setExecutionError(null)
    const analyticsContext = getBatchExportAnalyticsContext()
    void trackProductAnalyticsActionStarted(analyticsContext)
    try {
      const result = await executeManagedSiteTokenBatchExport({
        preview,
        selectedItemIds: selectedExecutionIds,
      })
      void trackProductAnalyticsActionCompleted({
        ...analyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          selectedCount: result.totalSelected,
          itemCount: result.attemptedCount,
          successCount: result.createdCount,
          failureCount: result.failedCount,
        },
      })
      if (!isCurrentWorkflow(confirmationWorkflowEpoch)) return
      setExecutionResult(result)
      onCompleted?.(result)
      toast.success(
        t("keyManagement:batchManagedSiteExport.messages.completed", {
          created: result.createdCount,
          failed: result.failedCount,
          skipped: result.skippedCount,
        }),
      )
    } catch (error) {
      void trackProductAnalyticsActionCompleted({
        ...analyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          selectedCount: selectedExecutionIds.length,
          itemCount: selectedExecutionIds.length,
        },
      })
      if (!isCurrentWorkflow(confirmationWorkflowEpoch)) return
      setExecutionError(getErrorMessage(error))
    } finally {
      if (isCurrentWorkflow(confirmationWorkflowEpoch)) {
        setIsRunning(false)
      }
    }
  }

  return {
    preview,
    selectedIds,
    modelOptions,
    previewError,
    executionError,
    isLoadingPreview,
    isManualPreviewRefresh: previewLoadOrigin === PREVIEW_LOAD_ORIGINS.MANUAL,
    isRunning,
    executionResult,
    isConfirmOpen,
    verifyingItemId,
    verification,
    executableSelection: {
      checked: executableSelectionChecked,
      itemCount: executableItems.length,
      selectedCount: selectedExecutableCount,
    },
    actions: {
      close: handleClose,
      refreshPreview: handleRefreshPreview,
      retryPreview: handleRetryPreview,
      toggleAll: handleToggleAll,
      toggleItem: handleToggleItem,
      changeItemModels: handleItemModelsChange,
      verifyAndRefresh: handleVerifyAndRefresh,
      openConfirm: () => {
        if (isCurrentWorkflow(activeWorkflowEpochRef.current)) {
          setIsConfirmOpen(true)
        }
      },
      closeConfirm: () => setIsConfirmOpen(false),
      confirm: handleConfirm,
    },
  }
}
