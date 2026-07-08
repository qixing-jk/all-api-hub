import type { TFunction } from "i18next"
import { useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"

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
  const [preview, setPreview] =
    useState<ManagedSiteTokenBatchExportPreview | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [executionResult, setExecutionResult] =
    useState<ManagedSiteTokenBatchExportExecutionResult | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [verifyingItemId, setVerifyingItemId] = useState<string | null>(null)
  const resolvedChannelKeysByItemIdRef = useRef<
    Record<string, Record<number, string>>
  >({})
  const latestItemsRef = useRef(items)
  const openedItemsRef = useRef(items)
  const wasOpenRef = useRef(false)

  latestItemsRef.current = items

  useEffect(() => {
    if (!isOpen) {
      setPreview(null)
      setSelectedIds(new Set())
      setIsLoadingPreview(false)
      setPreviewError(null)
      setExecutionError(null)
      setIsConfirmOpen(false)
      setIsRunning(false)
      setExecutionResult(null)
      setRefreshKey(0)
      setVerifyingItemId(null)
      wasOpenRef.current = false
      resolvedChannelKeysByItemIdRef.current = {}
      return
    }

    if (!wasOpenRef.current) {
      openedItemsRef.current = latestItemsRef.current
      wasOpenRef.current = true
    }

    let cancelled = false
    setPreview(null)
    setSelectedIds(new Set())
    setPreviewError(null)
    setExecutionError(null)
    setExecutionResult(null)
    setIsLoadingPreview(true)

    void (async () => {
      try {
        const nextPreview = await prepareManagedSiteTokenBatchExportPreview({
          items: openedItemsRef.current,
          resolvedChannelKeysByItemId: resolvedChannelKeysByItemIdRef.current,
        })
        if (cancelled) return
        setPreview(nextPreview)
        setSelectedIds(
          new Set(
            nextPreview.items
              .filter(shouldSelectPreviewItemByDefault)
              .map((item) => item.id),
          ),
        )
      } catch (error) {
        if (cancelled) return
        setPreviewError(getErrorMessage(error))
      } finally {
        if (!cancelled) {
          setIsLoadingPreview(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, refreshKey])

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
    if (isLoadingPreview || isRunning || verifyingItemId) return
    if (verification.dialogState.isOpen) return
    setExecutionError(null)
    setRefreshKey((value) => value + 1)
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
      const updatedItem = applyResolvedChannelKeyToPreviewItem({
        item,
        candidate,
        resolvedKey,
        siteType: preview?.siteType,
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
    if (
      verifyingItemId ||
      verification.dialogState.isOpen ||
      isLoadingPreview ||
      isRunning
    ) {
      return
    }

    const verificationTargets = getPreviewVerificationTargets(preview!)
    const targets =
      verificationTargets.length > 0
        ? verificationTargets
        : [{ item: requestedItem, candidate: requestedCandidate }]
    const failureMessages: string[] = []

    setExecutionError(null)

    const verifyTargetsFromIndex = async (startIndex: number) => {
      for (let index = startIndex; index < targets.length; index += 1) {
        const { item, candidate } = targets[index]
        let resolvedChannelKey = ""
        let shouldContinueAfterDeferredLoad = false
        let loadCompleted = false

        setVerifyingItemId(item.id)

        const handleLoaded = async () => {
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
          if (shouldContinueAfterDeferredLoad) {
            await verifyTargetsFromIndex(index + 1)
          }
        }

        try {
          const loadedImmediately = await loadNewApiChannelKeyWithVerification({
            channelId: candidate.id,
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
              resolvedChannelKey = key
            },
            onLoaded: handleLoaded,
            openVerification: (request) =>
              verification.openNewApiManagedVerification({
                ...request,
                closeMode:
                  NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_VERIFICATION,
              }),
          })

          if (!loadedImmediately) {
            if (!loadCompleted) {
              shouldContinueAfterDeferredLoad = true
              setVerifyingItemId(null)
              return
            }
          }
        } catch (error) {
          failureMessages.push(getErrorMessage(error))
        }
      }

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
    if (!preview || selectedExecutionIds.length === 0) return

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
      setExecutionError(getErrorMessage(error))
    } finally {
      setIsRunning(false)
    }
  }

  return {
    preview,
    selectedIds,
    modelOptions,
    previewError,
    executionError,
    isLoadingPreview,
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
      toggleAll: handleToggleAll,
      toggleItem: handleToggleItem,
      changeItemModels: handleItemModelsChange,
      verifyAndRefresh: handleVerifyAndRefresh,
      openConfirm: () => setIsConfirmOpen(true),
      closeConfirm: () => setIsConfirmOpen(false),
      confirm: handleConfirm,
    },
  }
}
