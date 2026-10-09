import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { isBatchSelectableEntry } from "~/features/KeyManagement/runtimeKeyExportEligibility"
import {
  type ApiCredentialProfileSaveEntry,
  type KeyManagementEntry,
} from "~/features/KeyManagement/types"
import { saveAccountRuntimeKeysToApiCredentialProfiles } from "~/features/TokenProvisioning/secretDelivery/apiCredentialProfileSaveAction"
import { type AccountRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import {
  isResolvedManagedSiteTokenBatchExportItemInput,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("TokenList")

const isBatchSnapshotEligible = (
  items: ReadonlyArray<Pick<KeyManagementEntry, "runtimeKey">>,
  eligibilityByRuntimeKeyId: ReadonlyMap<string, boolean>,
) =>
  items.every(
    (item) => eligibilityByRuntimeKeyId.get(item.runtimeKey.id) === true,
  )

interface BatchTokenActionsInput {
  actionEntries: KeyManagementEntry[]
  filteredActionEntries: KeyManagementEntry[]
  onManagedSiteImportSuccess?: (
    runtimeKey: AccountRuntimeKey,
  ) => void | Promise<void>
}

/** Owns batch selection, eligibility, and frozen export execution snapshots. */
export function useBatchTokenActions({
  actionEntries,
  filteredActionEntries,
  onManagedSiteImportSuccess,
}: BatchTokenActionsInput) {
  const { t } = useTranslation(["keyManagement", "settings"])
  const [batchExportOpen, setBatchExportOpen] = useState(false)
  const [batchExportItems, setBatchExportItems] = useState<
    ManagedSiteTokenBatchExportItemInput[]
  >([])

  const [isBatchApiProfilesSaving, setIsBatchApiProfilesSaving] =
    useState(false)
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    () => new Set(),
  )

  const eligibleEntries = useMemo(
    () => actionEntries.filter(isBatchSelectableEntry),
    [actionEntries],
  )
  const eligibleEntryIds = useMemo(
    () => new Set(eligibleEntries.map((entry) => entry.id)),
    [eligibleEntries],
  )
  const filteredEligibleEntries = useMemo(
    () =>
      filteredActionEntries.filter((entry) => eligibleEntryIds.has(entry.id)),
    [eligibleEntryIds, filteredActionEntries],
  )
  const hasFilteredIneligibleEntries =
    filteredEligibleEntries.length < filteredActionEntries.length
  const filteredEligibleEntryIds = useMemo(
    () => new Set(filteredEligibleEntries.map((entry) => entry.id)),
    [filteredEligibleEntries],
  )
  const selectedVisibleCount = useMemo(
    () =>
      Array.from(selectedEntryIds).filter((entryId) =>
        filteredEligibleEntryIds.has(entryId),
      ).length,
    [filteredEligibleEntryIds, selectedEntryIds],
  )
  const allFilteredSelected =
    filteredEligibleEntries.length > 0 &&
    selectedVisibleCount === filteredEligibleEntries.length
  const visibleSelectionChecked: boolean | "indeterminate" =
    selectedVisibleCount === 0
      ? false
      : selectedVisibleCount === filteredEligibleEntries.length
        ? true
        : "indeterminate"
  const selectedEntries = useMemo(
    () => eligibleEntries.filter((entry) => selectedEntryIds.has(entry.id)),
    [eligibleEntries, selectedEntryIds],
  )
  const selectedManagedSiteBatchItems = useMemo(
    (): ManagedSiteTokenBatchExportItemInput[] =>
      selectedEntries.map((entry) => ({
        account: entry.runtimeKey.account as DisplaySiteData,
        runtimeKey: entry.runtimeKey,
      })),
    [selectedEntries],
  )
  const selectedApiProfileItems = useMemo(
    (): ApiCredentialProfileSaveEntry[] => selectedEntries,
    [selectedEntries],
  )

  const currentBatchEligibilityByRuntimeKeyId = useMemo(
    () =>
      new Map(
        actionEntries.map((entry) => [
          entry.runtimeKey.id,
          isBatchSelectableEntry(entry),
        ]),
      ),
    [actionEntries],
  )
  const isBatchExportSnapshotEligible = useMemo(
    () =>
      isBatchSnapshotEligible(
        batchExportItems.filter(isResolvedManagedSiteTokenBatchExportItemInput),
        currentBatchEligibilityByRuntimeKeyId,
      ),
    [batchExportItems, currentBatchEligibilityByRuntimeKeyId],
  )

  useEffect(() => {
    setSelectedEntryIds((prev) => {
      const next = new Set(
        Array.from(prev).filter((entryId) => eligibleEntryIds.has(entryId)),
      )
      return next.size === prev.size ? prev : next
    })
  }, [eligibleEntryIds])

  useEffect(() => {
    if (batchExportOpen && !isBatchExportSnapshotEligible) {
      setBatchExportOpen(false)
      setBatchExportItems([])
    }
  }, [batchExportOpen, isBatchExportSnapshotEligible])

  const toggleEntrySelection = (entryId: string, checked: boolean) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(entryId)
      } else {
        next.delete(entryId)
      }
      return next
    })
  }

  const getSelectionProps = (entryId: string) => {
    const isBatchSelectable = eligibleEntryIds.has(entryId)
    return {
      isSelected: isBatchSelectable && selectedEntryIds.has(entryId),
      onSelectionChange: isBatchSelectable
        ? (checked: boolean) => toggleEntrySelection(entryId, checked)
        : undefined,
      selectionDisabledReason: isBatchSelectable
        ? undefined
        : t("keyManagement:batchSelection.unavailableReason"),
    }
  }

  const toggleFilteredSelection = () => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      for (const entry of filteredEligibleEntries) {
        if (allFilteredSelected) {
          next.delete(entry.id)
        } else {
          next.add(entry.id)
        }
      }
      return next
    })
  }

  const toggleGroupSelection = (
    groupEntries: KeyManagementEntry[],
    checked: boolean | "indeterminate",
  ) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      const shouldSelect = checked === true

      for (const entry of groupEntries) {
        if (shouldSelect) {
          next.add(entry.id)
        } else {
          next.delete(entry.id)
        }
      }

      return next
    })
  }

  const clearSelection = () => {
    setSelectedEntryIds(new Set())
  }

  const openBatchExportDialog = () => {
    setBatchExportItems(selectedManagedSiteBatchItems)
    setBatchExportOpen(true)
  }

  const closeBatchExportDialog = () => {
    setBatchExportOpen(false)
    setBatchExportItems([])
  }

  const handleBatchSaveToApiProfiles = async () => {
    if (selectedApiProfileItems.length === 0 || isBatchApiProfilesSaving) return

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountRuntimeKeysToApiCredentialProfiles,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    setIsBatchApiProfilesSaving(true)
    try {
      await saveAccountRuntimeKeysToApiCredentialProfiles({
        items: selectedApiProfileItems,
        t,
        logger,
        source: "TokenListBatchAction",
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      clearSelection()
    } catch {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      setIsBatchApiProfilesSaving(false)
    }
  }

  const handleBatchExportCompleted = (
    result: ManagedSiteTokenBatchExportExecutionResult,
  ) => {
    if (!onManagedSiteImportSuccess) return

    const selectedTokenByIdentity = new Map(
      batchExportItems.flatMap((item) =>
        isResolvedManagedSiteTokenBatchExportItemInput(item)
          ? [[item.runtimeKey.id, item.runtimeKey] as const]
          : [],
      ),
    )

    for (const item of result.items) {
      if (!item.success) continue
      const token = selectedTokenByIdentity.get(item.id)
      if (!token) continue
      void Promise.resolve(onManagedSiteImportSuccess(token))
    }
  }

  return {
    batchExportOpen,
    batchExportItems,
    isBatchApiProfilesSaving,
    selectedEntryIds,
    filteredEligibleEntries,
    hasFilteredIneligibleEntries,
    selectedVisibleCount,
    visibleSelectionChecked,
    selectedEntries,
    selectedManagedSiteBatchItems,
    selectedApiProfileItems,
    isBatchExportSnapshotEligible,
    getSelectionProps,
    toggleFilteredSelection,
    toggleGroupSelection,
    clearSelection,
    openBatchExportDialog,
    closeBatchExportDialog,
    handleBatchSaveToApiProfiles,
    handleBatchExportCompleted,
  }
}
