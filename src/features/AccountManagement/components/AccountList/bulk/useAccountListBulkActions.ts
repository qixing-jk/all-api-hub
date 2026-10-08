import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useAccountActionsContext } from "~/features/AccountManagement/actions/AccountActionsContext"
import {
  orderAccountsByDisplayOrder,
  type AccountListDisplayItem,
} from "~/features/AccountManagement/components/AccountList/ordering/accountListOrdering"
import {
  getInviteLinkFailureAnalyticsCategory,
  getInviteLinkFailureSummary,
  getPrimaryInviteLinkFailureReason,
} from "~/features/AccountManagement/inviteLinkCopyFeedback"
import {
  BULK_INVITE_LINK_COPY_POLICY,
  INVITE_LINK_COPY_RESULTS,
  runInviteLinkCopyWorkflow,
} from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import {
  runSiteUrlCopyWorkflow,
  SITE_URL_COPY_RESULTS,
} from "~/features/AccountManagement/siteUrlCopyWorkflow"
import toast from "~/lib/notify"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"

/** Owns selection, batch execution, feedback and cancellation for the list. */
export function useAccountListBulkActions({
  displayData,
  filteredSites,
  groupedDisplayItems,
  setIsBulkMode,
  onEnterBulkMode,
}: {
  displayData: DisplaySiteData[]
  filteredSites: DisplaySiteData[]
  groupedDisplayItems: AccountListDisplayItem[]
  setIsBulkMode: (enabled: boolean) => void
  onEnterBulkMode: () => void
}) {
  const { t } = useTranslation(["account", "common"])
  const { handleDeleteAccounts, handleSetAccountsDisabled } =
    useAccountActionsContext()
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkDisabling, setIsBulkDisabling] = useState(false)
  const [isBulkCopyingInviteLinks, setIsBulkCopyingInviteLinks] =
    useState(false)
  const [isBulkCopyingSiteUrls, setIsBulkCopyingSiteUrls] = useState(false)
  const [manualInviteLinkPayload, setManualInviteLinkPayload] = useState<
    string | null
  >(null)
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const isMountedRef = useRef(true)
  const inviteLinkCopyAbortControllerRef = useRef<AbortController | null>(null)
  const isBulkCopyingSiteUrlsRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      inviteLinkCopyAbortControllerRef.current?.abort()
    }
  }, [])

  const allAccountIdSet = useMemo(
    () => new Set(displayData.map((account) => account.id)),
    [displayData],
  )

  useEffect(() => {
    setSelectedAccountIds((previous) =>
      previous.filter((accountId) => allAccountIdSet.has(accountId)),
    )
  }, [allAccountIdSet])

  useEffect(() => {
    if (displayData.length === 0) {
      setIsBulkMode(false)
      setSelectedAccountIds([])
    }
  }, [displayData.length, setIsBulkMode])

  const selectedIdSet = useMemo(
    () => new Set(selectedAccountIds),
    [selectedAccountIds],
  )
  const visibleAccountIds = useMemo(
    () => filteredSites.map((account) => account.id),
    [filteredSites],
  )
  const visibleAccountIdSet = useMemo(
    () => new Set(visibleAccountIds),
    [visibleAccountIds],
  )
  const selectedAccounts = useMemo(
    () => displayData.filter((account) => selectedIdSet.has(account.id)),
    [displayData, selectedIdSet],
  )
  // Copies follow the rendered rows, so pasted output matches what the user
  // sees; selections hidden by search or filters stay at the end.
  const selectedAccountsInDisplayOrder = useMemo(
    () => orderAccountsByDisplayOrder(selectedAccounts, groupedDisplayItems),
    [groupedDisplayItems, selectedAccounts],
  )
  const selectedVisibleCount = useMemo(
    () =>
      selectedAccounts.filter((account) => visibleAccountIdSet.has(account.id))
        .length,
    [selectedAccounts, visibleAccountIdSet],
  )
  const hiddenSelectedCount = selectedAccountIds.length - selectedVisibleCount
  const selectedEnabledAccounts = useMemo(
    () => selectedAccounts.filter((account) => account.disabled !== true),
    [selectedAccounts],
  )
  const bulkDeletePreviewAccounts = useMemo(
    () => selectedAccounts.slice(0, 6),
    [selectedAccounts],
  )

  const isBulkBusy =
    isBulkDeleting ||
    isBulkDisabling ||
    isBulkCopyingInviteLinks ||
    isBulkCopyingSiteUrls
  const accountListAnalyticsBaseContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  }

  const updateSelectedAccountIds = (
    updater: (previous: string[]) => string[],
  ) => {
    setSelectedAccountIds((previous) => Array.from(new Set(updater(previous))))
  }

  const handleBulkModeEnter = () => {
    void trackProductAnalyticsActionStarted({
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnterAccountBulkMode,
    })
    onEnterBulkMode()
    setIsBulkMode(true)
  }

  const handleBulkModeExit = () => {
    if (isBulkBusy) return

    void trackProductAnalyticsActionStarted({
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExitAccountBulkMode,
    })
    setIsBulkMode(false)
    setSelectedAccountIds([])
    setIsBulkDeleteConfirmOpen(false)
  }

  const handleToggleAccountSelection = (
    accountId: string,
    checked: boolean,
  ) => {
    updateSelectedAccountIds((previous) =>
      checked
        ? [...previous, accountId]
        : previous.filter((selectedId) => selectedId !== accountId),
    )
  }

  const handleSelectVisibleAccounts = () => {
    updateSelectedAccountIds((previous) => [...previous, ...visibleAccountIds])
  }

  const handleClearVisibleSelection = () => {
    if (visibleAccountIds.length === 0) return

    const visibleIds = new Set(visibleAccountIds)
    updateSelectedAccountIds((previous) =>
      previous.filter((selectedId) => !visibleIds.has(selectedId)),
    )
  }

  const handleClearAllSelection = () => {
    if (isBulkBusy) return
    setSelectedAccountIds([])
  }

  const handleBulkDisable = async () => {
    if (selectedEnabledAccounts.length === 0 || isBulkBusy) {
      return
    }

    const itemCount = selectedEnabledAccounts.length
    const selectedCount = selectedAccountIds.length
    const analyticsContext = {
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DisableSelectedAccounts,
    }
    const tracker = startProductAnalyticsAction(analyticsContext)

    setIsBulkDisabling(true)
    try {
      const { updatedCount, updatedIds } = await handleSetAccountsDisabled(
        selectedEnabledAccounts,
        true,
      )
      const failureCount = Math.max(0, itemCount - updatedCount)
      tracker.complete(
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
        {
          ...(failureCount > 0
            ? {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              }
            : {}),
          insights: {
            itemCount,
            selectedCount,
            successCount: updatedCount,
            failureCount,
          },
        },
      )
      if (updatedIds.length > 0) {
        const updatedIdSet = new Set(updatedIds)
        setSelectedAccountIds((previous) =>
          previous.filter((accountId) => !updatedIdSet.has(accountId)),
        )
      }
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount,
          selectedCount,
          successCount: 0,
          failureCount: itemCount,
        },
      })
      throw error
    } finally {
      setIsBulkDisabling(false)
    }
  }

  const handleBulkCopyInviteLinks = async () => {
    if (isBulkCopyingInviteLinks || inviteLinkCopyAbortControllerRef.current) {
      return
    }

    const analyticsContext = {
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
    }
    const tracker = startProductAnalyticsAction(analyticsContext)
    const controller = new AbortController()
    inviteLinkCopyAbortControllerRef.current = controller

    setIsBulkCopyingInviteLinks(true)
    try {
      const result = await runInviteLinkCopyWorkflow({
        accounts: selectedAccountsInDisplayOrder,
        format: "labeled",
        signal: controller.signal,
        ...BULK_INVITE_LINK_COPY_POLICY,
      })
      const insights = {
        itemCount: result.itemCount,
        selectedCount: result.selectedCount,
        successCount: result.successCount,
        failureCount: result.failureCount,
        skippedCount: result.skippedCount + result.unsupportedCount,
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.Cancelled) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, { insights })
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.ClipboardFailure) {
        setManualInviteLinkPayload(result.payload ?? null)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
          insights,
        })
        const hasOtherOutcomes =
          result.failureCount > 0 ||
          result.unsupportedCount > 0 ||
          result.skippedCount > 0
        toast.error(
          hasOtherOutcomes
            ? t("account:bulk.copyInviteLinksClipboardFailedWithReasons", {
                reasonSummary: getInviteLinkFailureSummary(t, result),
              })
            : t("account:bulk.copyInviteLinksClipboardFailed"),
        )
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.Unsupported) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
          insights,
        })
        toast.error(t("account:bulk.copyInviteLinksUnsupported"))
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.Failure) {
        const primaryFailureReason = getPrimaryInviteLinkFailureReason(
          result.failureReasonCounts,
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory:
            getInviteLinkFailureAnalyticsCategory(primaryFailureReason),
          insights,
        })
        toast.error(
          t("account:bulk.copyInviteLinksFailedWithReasons", {
            reasonSummary: getInviteLinkFailureSummary(t, result),
          }),
        )
        return
      }

      const isPartial =
        result.result === INVITE_LINK_COPY_RESULTS.PartialSuccess
      const primaryFailureReason = getPrimaryInviteLinkFailureReason(
        result.failureReasonCounts,
      )
      tracker.complete(
        isPartial
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
        {
          ...(isPartial
            ? {
                errorCategory:
                  result.failureCount > 0
                    ? getInviteLinkFailureAnalyticsCategory(
                        primaryFailureReason,
                      )
                    : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
              }
            : {}),
          insights: {
            ...insights,
            ...(isPartial
              ? {
                  failureReason:
                    PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
                }
              : {}),
          },
        },
      )

      toast.success(
        !isPartial
          ? t("account:bulk.copyInviteLinksSuccess", {
              count: result.successCount,
            })
          : t("account:bulk.copyInviteLinksPartialSuccess", {
              successCount: result.successCount,
              reasonSummary: getInviteLinkFailureSummary(t, result),
            }),
      )
    } catch {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: selectedEnabledAccounts.length,
          selectedCount: selectedAccountIds.length,
          successCount: 0,
          failureCount: selectedEnabledAccounts.length,
          skippedCount:
            selectedAccounts.length - selectedEnabledAccounts.length,
        },
      })
      toast.error(t("account:bulk.copyInviteLinksFailed"))
    } finally {
      if (inviteLinkCopyAbortControllerRef.current === controller) {
        inviteLinkCopyAbortControllerRef.current = null
        if (isMountedRef.current) setIsBulkCopyingInviteLinks(false)
      }
    }
  }

  const handleBulkCopySiteUrls = async () => {
    if (
      selectedAccounts.length === 0 ||
      isBulkBusy ||
      isBulkCopyingSiteUrlsRef.current
    ) {
      return
    }

    const tracker = startProductAnalyticsAction({
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountSiteUrls,
    })
    isBulkCopyingSiteUrlsRef.current = true
    setIsBulkCopyingSiteUrls(true)
    try {
      const result = await runSiteUrlCopyWorkflow({
        accounts: selectedAccountsInDisplayOrder,
      })
      const insights = {
        itemCount: result.itemCount,
        selectedCount: result.selectedCount,
        successCount: result.successCount,
        failureCount: result.failureCount,
        skippedCount: result.skippedCount,
      }

      if (result.result === SITE_URL_COPY_RESULTS.NoCopyableUrls) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
          insights,
        })
        toast.error(t("account:bulk.copySiteUrlsNone"))
        return
      }

      if (result.result === SITE_URL_COPY_RESULTS.ClipboardFailure) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
          insights,
        })
        toast.error(t("account:bulk.copySiteUrlsClipboardFailed"))
        return
      }

      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, { insights })
      toast.success(
        t("account:bulk.copySiteUrlsSuccess", { count: result.itemCount }),
      )
    } finally {
      isBulkCopyingSiteUrlsRef.current = false
      if (isMountedRef.current) {
        setIsBulkCopyingSiteUrls(false)
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedAccounts.length === 0 || isBulkBusy) {
      return
    }

    const itemCount = selectedAccounts.length
    const selectedCount = selectedAccountIds.length
    const analyticsContext = {
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccount,
    }
    const tracker = startProductAnalyticsAction(analyticsContext)

    setIsBulkDeleting(true)
    try {
      const { deletedCount, deletedIds } =
        await handleDeleteAccounts(selectedAccounts)
      const failureCount = Math.max(0, itemCount - deletedCount)
      tracker.complete(
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
        {
          ...(failureCount > 0
            ? {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              }
            : {}),
          insights: {
            itemCount,
            selectedCount,
            successCount: deletedCount,
            failureCount,
          },
        },
      )
      if (deletedIds.length > 0) {
        const deletedIdSet = new Set(deletedIds)
        setSelectedAccountIds((previous) =>
          previous.filter((accountId) => !deletedIdSet.has(accountId)),
        )
      }
      setIsBulkDeleteConfirmOpen(false)

      if (deletedCount > 0 && displayData.length - deletedCount <= 0) {
        setIsBulkMode(false)
      }
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount,
          selectedCount,
          successCount: 0,
          failureCount: itemCount,
        },
      })
      throw error
    } finally {
      setIsBulkDeleting(false)
    }
  }

  return {
    selectedAccountIds,
    selectedIdSet,
    selectedAccounts,
    visibleAccountIdSet,
    hiddenSelectedCount,
    bulkDeletePreviewAccounts,
    isBulkBusy,
    isBulkDeleting,
    isBulkDisabling,
    isBulkCopyingInviteLinks,
    manualInviteLinkPayload,
    isBulkDeleteConfirmOpen,
    setManualInviteLinkPayload,
    setIsBulkDeleteConfirmOpen,
    handleBulkModeEnter,
    handleBulkModeExit,
    handleToggleAccountSelection,
    handleSelectVisibleAccounts,
    handleClearVisibleSelection,
    handleClearAllSelection,
    handleBulkDisable,
    handleBulkCopyInviteLinks,
    handleBulkCopySiteUrls,
    handleBulkDelete,
  }
}
