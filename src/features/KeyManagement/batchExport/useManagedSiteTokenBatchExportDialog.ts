import type { TFunction } from "i18next"
import { useMemo } from "react"

import { PREVIEW_LOAD_ORIGINS } from "~/constants/previewLoadOrigin"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { getPreviewVerificationTargets } from "~/features/KeyManagement/batchExport/managedSiteTokenBatchExportPreview"
import { shouldConfirmManagedSiteTokenBatchExport } from "~/features/KeyManagement/batchExport/managedSiteTokenBatchExportSession"
import { verifyManagedSiteTokenBatchTargets } from "~/features/KeyManagement/batchExport/managedSiteTokenBatchVerification"
import { useManagedSiteTokenBatchSession } from "~/features/KeyManagement/batchExport/useManagedSiteTokenBatchSession"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import toast from "~/lib/notify"
import { getManagedSiteRuntimeConfigFingerprint } from "~/services/managedSites/runtimeConfig"
import { executeManagedSiteTokenBatchExport } from "~/services/managedSites/tokenBatchImportExecution"
import { DEFAULT_MANAGED_SITE_TOKEN_BATCH_IMPORT_INTENT } from "~/services/managedSites/tokenBatchImportPreview"
import {
  trackProductAnalyticsActionCompleted,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_BATCH_IMPORT_SOURCES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import type {
  ManagedSiteBatchImportIntent,
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportItemInput,
  ManagedSiteTokenBatchExportMatchedChannel,
  ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
} from "~/types/managedSiteTokenBatchExport"

export interface ManagedSiteTokenBatchExportDialogProps {
  isOpen: boolean
  onClose: () => void
  items: ManagedSiteTokenBatchExportItemInput[]
  intent?: ManagedSiteBatchImportIntent
  onCompleted?: (
    result: ManagedSiteTokenBatchExportExecutionResult,
    context: ManagedSiteTokenBatchExportCompletionContext,
  ) => void
}

/** Controlled completion facts exposed to entry-point owners without drafts or secrets. */
export interface ManagedSiteTokenBatchExportCompletionContext {
  alreadyPresentItemIds: string[]
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

const getBatchExportAnalyticsSource = (
  source: ManagedSiteBatchImportIntent["source"],
) =>
  source === MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED
    ? PRODUCT_ANALYTICS_MANAGED_SITE_BATCH_IMPORT_SOURCES.RepairCreated
    : PRODUCT_ANALYTICS_MANAGED_SITE_BATCH_IMPORT_SOURCES.ManualSelection

/**
 * Builds the workflow state and view actions for the token batch export dialog.
 */
export function useManagedSiteTokenBatchExportDialog({
  isOpen,
  onClose,
  items,
  intent = DEFAULT_MANAGED_SITE_TOKEN_BATCH_IMPORT_INTENT,
  onCompleted,
  t,
}: UseManagedSiteTokenBatchExportDialogParams) {
  const {
    managedSiteType,
    preferences,
    newApiBaseUrl,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
  } = useUserPreferencesContext()
  const managedSiteConfigFingerprint = useMemo(
    () => getManagedSiteRuntimeConfigFingerprint(preferences, managedSiteType),
    [managedSiteType, preferences],
  )
  const verification = useNewApiManagedVerification()
  const isVerificationDialogOpen = verification.dialogState.isOpen
  const closeVerificationDialog = verification.closeDialog
  const session = useManagedSiteTokenBatchSession({
    isOpen,
    items,
    intent,
    managedSiteConfigFingerprint,
    isVerificationDialogOpen,
    closeVerificationDialog,
  })
  const {
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
    handleRefreshPreview,
    handleRetryPreview,
    handleUseCompleteChecks,
    handleRetry,
    handleToggleAll,
    handleToggleItem,
    handleItemModelsChange,
  } = session
  const handleClose = () => {
    if (isRunning) return
    if (verification.dialogState.isOpen) {
      verification.closeDialog()
    }
    onClose()
  }

  const handleVerifyAndRefresh = async (
    requestedItem: ManagedSiteTokenBatchExportPreviewItem,
    requestedCandidate: ManagedSiteTokenBatchExportMatchedChannel,
  ) => {
    const isActive = session.captureWorkflow()
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
    await verifyManagedSiteTokenBatchTargets({
      targets,
      config: {
        baseUrl: newApiBaseUrl,
        userId: newApiUserId,
        username: newApiUsername,
        password: newApiPassword,
        totpSecret: newApiTotpSecret,
      },
      isActive,
      openVerification: verification.openNewApiManagedVerification,
      onProgress: session.setVerificationProgress,
      onResolved: ({ item, candidate }, key) =>
        session.resolveChannelKey(item, candidate, key),
      onFailure: session.setVerificationFailure,
    })
  }

  const handleConfirm = async () => {
    const isActive = session.captureWorkflow()
    if (!isActive() || !preview || selectedExecutionIds.length === 0) {
      return
    }

    session.beginExecution()
    const analyticsContext = getBatchExportAnalyticsContext()
    const managedSiteBatchImportSource = getBatchExportAnalyticsSource(
      activeIntent.source,
    )
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
          managedSiteBatchImportSource,
          selectedCount: result.totalSelected,
          itemCount: result.attemptedCount,
          successCount: result.createdCount,
          failureCount: result.failedCount,
        },
      })
      if (!isActive()) return
      const cumulativeResult = session.completeExecution(result)
      onCompleted?.(result, {
        alreadyPresentItemIds: preview.items
          .filter(
            (item) =>
              item.status ===
                MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED &&
              item.matchedChannel,
          )
          .map((item) => item.id),
      })
      toast.success(
        t("keyManagement:batchManagedSiteExport.messages.completed", {
          created: cumulativeResult.createdCount,
          failed: cumulativeResult.failedCount,
          skipped: cumulativeResult.skippedCount,
        }),
      )
    } catch (error) {
      void trackProductAnalyticsActionCompleted({
        ...analyticsContext,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          managedSiteBatchImportSource,
          selectedCount: selectedExecutionIds.length,
          itemCount: selectedExecutionIds.length,
        },
      })
      if (!isActive()) return
      session.failExecution(error)
    } finally {
      if (isActive()) {
        session.finishExecution()
      }
    }
  }

  const handleStart = () => {
    if (
      !session.captureWorkflow()() ||
      !preview ||
      selectedExecutionIds.length === 0
    ) {
      return
    }

    if (shouldConfirmManagedSiteTokenBatchExport(activeIntent)) {
      session.showConfirmation()
      return
    }

    void handleConfirm()
  }

  return {
    preview,
    intent: activeIntent,
    selectedIds,
    modelOptions,
    previewError,
    executionError:
      executionFailure?.kind === "target-changed"
        ? t("keyManagement:batchManagedSiteExport.messages.targetChanged")
        : executionFailure?.kind === "verification"
          ? t(
              "keyManagement:batchManagedSiteExport.messages.verificationFailed",
              { error: executionFailure.message },
            )
          : executionFailure?.message ?? null,
    isTargetChanged,
    isLoadingPreview,
    isManualPreviewRefresh: previewLoadOrigin === PREVIEW_LOAD_ORIGINS.MANUAL,
    isRunning,
    executionResult,
    retryItemIds,
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
      useCompleteChecks: handleUseCompleteChecks,
      retry: handleRetry,
      start: () => {
        handleStart()
      },
      closeConfirm: session.closeConfirmation,
      confirm: handleConfirm,
    },
  }
}
