import type { TFunction } from "i18next"
import { useMemo, useState } from "react"

import { PREVIEW_LOAD_ORIGINS } from "~/constants/previewLoadOrigin"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { getPreviewVerificationTargets } from "~/features/KeyManagement/batchExport/managedSiteTokenBatchExportPreview"
import {
  MANAGED_SITE_BATCH_EXECUTION_FAILURE_KINDS,
  shouldConfirmManagedSiteTokenBatchExport,
} from "~/features/KeyManagement/batchExport/managedSiteTokenBatchExportSession"
import { verifyManagedSiteTokenBatchTargets } from "~/features/KeyManagement/batchExport/managedSiteTokenBatchVerification"
import { useManagedSiteTokenBatchSession } from "~/features/KeyManagement/batchExport/useManagedSiteTokenBatchSession"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import toast from "~/lib/notify"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  supportsNativeManagedChannelExistingImport,
  supportsNativeManagedChannelMultiKeyImport,
} from "~/services/apiAdapters/managedResources/channelImport"
import { executeManagedSiteTokenBatchExport } from "~/services/managedSites/batchImport/tokenBatchImportExecution"
import { planManagedSiteTokenBatchImport } from "~/services/managedSites/batchImport/tokenBatchImportPlan"
import { DEFAULT_MANAGED_SITE_TOKEN_BATCH_IMPORT_INTENT } from "~/services/managedSites/batchImport/tokenBatchImportPreview"
import { getManagedSiteRuntimeConfigFingerprint } from "~/services/managedSites/configuration/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
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
  ManagedSiteTokenBatchImportMode,
} from "~/types/managedSiteTokenBatchExport"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem,
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
    loadPreferences,
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
  const [modeOverrides, setModeOverrides] = useState<
    Record<string, ManagedSiteTokenBatchImportMode>
  >({})
  const [resourceNames, setResourceNames] = useState<Record<string, string>>({})
  const [resourceTargets, setResourceTargets] = useState<
    Record<string, ManagedResourceRef | null>
  >({})
  const targetIdentity = preview?.targetFingerprint ?? ""
  const savedMode =
    preferences?.managedSiteTokenBatchImportModes?.[targetIdentity]
  const importMode =
    modeOverrides[targetIdentity] ??
    (savedMode === "reuse"
      ? "reuse"
      : savedMode === "grouped"
        ? "grouped"
        : "independent")
  const canReuse = Boolean(
    preview && supportsNativeManagedChannelExistingImport(preview.siteType),
  )
  const selectedPlanItems = executableItems
    .filter(isExecutableManagedSiteTokenBatchExportPreviewItem)
    .filter((item) => selectedIds.has(item.id))
  const canGroup =
    Boolean(preview) &&
    executableItems.some(
      (item) =>
        item.draft &&
        supportsNativeManagedChannelMultiKeyImport(
          preview!.siteType,
          item.draft,
        ),
    )
  const previewItemsById = useMemo(
    () => new Map(preview?.items.map((item) => [item.id, item]) ?? []),
    [preview],
  )
  const importGroups = (
    preview
      ? planManagedSiteTokenBatchImport(
          preview.siteType,
          selectedPlanItems,
          importMode,
          Object.fromEntries(
            Object.entries(resourceTargets)
              .filter(([key]) => key.startsWith(`${targetIdentity}:`))
              .map(([key, value]) => [
                key.slice(targetIdentity.length + 1),
                value,
              ]),
          ),
        )
      : []
  ).map((group) => ({
    ...group,
    draft: {
      ...group.draft,
      name: resourceNames[`${targetIdentity}:${group.id}`] ?? group.draft.name,
    },
  }))
  const hasInvalidImportGroups =
    importMode !== "independent" &&
    importGroups.some(
      (group) =>
        group.requiresTargetSelection ||
        (!group.target && !group.draft.name.trim()),
    )
  const handleImportGroupTargetChange = (
    id: string,
    ref: ManagedResourceRef | null,
  ) => {
    if (isRunning || executionResult) return
    setResourceTargets((current) => ({
      ...current,
      [`${targetIdentity}:${id}`]: ref,
    }))
  }
  const handleImportGroupNameChange = (id: string, name: string) => {
    if (isRunning || executionResult) return
    setResourceNames((current) => ({
      ...current,
      [`${targetIdentity}:${id}`]: name,
    }))
  }
  const handleImportModeChange = async (mode: string) => {
    if (
      !targetIdentity ||
      isRunning ||
      executionResult ||
      (mode !== "independent" && mode !== "grouped" && mode !== "reuse") ||
      (mode === "reuse" && !canReuse)
    )
      return
    setModeOverrides((current) => ({ ...current, [targetIdentity]: mode }))
    const result = await userPreferences.savePreferences({
      managedSiteTokenBatchImportModes: { [targetIdentity]: mode },
    })
    if (result.ok) {
      await loadPreferences?.()
    } else {
      toast.error(
        t("keyManagement:batchManagedSiteExport.importMode.saveFailed"),
      )
    }
  }
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

    const verificationTargets = getPreviewVerificationTargets(
      retryItemIds.size
        ? {
            ...preview,
            items: preview.items.filter((item) => retryItemIds.has(item.id)),
          }
        : preview,
    )
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
    if (
      !isActive() ||
      !preview ||
      selectedExecutionIds.length === 0 ||
      hasInvalidImportGroups
    ) {
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
        ...(importMode !== "independent"
          ? {
              mode: importMode,
              ...(importMode === "reuse"
                ? {
                    targetsByGroupId: Object.fromEntries(
                      importGroups.map((group) => [
                        group.id,
                        group.target?.ref ?? null,
                      ]),
                    ),
                  }
                : {}),
              resourceNamesByItemId: Object.fromEntries(
                importGroups.map((group) => [
                  group.id,
                  group.draft.name.trim(),
                ]),
              ),
            }
          : {}),
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
        t(
          importMode !== "independent"
            ? "keyManagement:batchManagedSiteExport.importMode.resultSummary"
            : "keyManagement:batchManagedSiteExport.messages.completed",
          {
            created: cumulativeResult.createdCount,
            failed: cumulativeResult.failedCount,
            skipped: cumulativeResult.skippedCount,
            uncertain: cumulativeResult.uncertainCount,
          },
        ),
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
      selectedExecutionIds.length === 0 ||
      hasInvalidImportGroups
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
    managedSiteType,
    preview,
    intent: activeIntent,
    selectedIds,
    modelOptions,
    previewError,
    executionError:
      executionFailure?.kind ===
      MANAGED_SITE_BATCH_EXECUTION_FAILURE_KINDS.TARGET_CHANGED
        ? t("keyManagement:batchManagedSiteExport.messages.targetChanged")
        : executionFailure?.kind ===
            MANAGED_SITE_BATCH_EXECUTION_FAILURE_KINDS.VERIFICATION
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
    retainedExecutionItems: session.retainedExecutionItems,
    retryItemIds,
    isConfirmOpen,
    verifyingItemId,
    verification,
    executableSelection: {
      checked: executableSelectionChecked,
      itemCount: executableItems.length,
      selectedCount: selectedExecutableCount,
    },
    importMode,
    importGroups,
    canGroup,
    canReuse,
    previewItemsById,
    hasInvalidImportGroups,
    actions: {
      changeImportMode: handleImportModeChange,
      changeImportGroupName: handleImportGroupNameChange,
      changeImportGroupTarget: handleImportGroupTargetChange,
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
