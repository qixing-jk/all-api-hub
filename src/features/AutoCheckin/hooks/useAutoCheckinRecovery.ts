import { useCallback, useState, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import { openExternalCheckIns } from "~/features/AccountManagement/utils/openExternalCheckIns"
import toast from "~/lib/notify"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionCompleted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { type AutoCheckinStatus } from "~/types/autoCheckin"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { getExternalCheckInOpenOptions } from "~/utils/core/shortcutKeys"
import {
  openAccountBaseUrl,
  openCheckInPage,
  openCheckInPages,
} from "~/utils/navigation/sitePages"

/**
 * Unified logger scoped to the Auto Check-in options page.
 */
const logger = createLogger("AutoCheckinOptionsPage")

/** Own row and batch recovery commands, their busy state and partial-success feedback. */
export function useAutoCheckinRecovery({
  resolveAutoCheckinAccount,
  loadStatus,
  failedManualAccountIds,
  externalCheckInAccounts,
  accountInfoById,
}: {
  resolveAutoCheckinAccount: (
    accountId: string,
    options?: { includeDisabled?: boolean },
  ) => Promise<DisplaySiteData>
  loadStatus: () => Promise<AutoCheckinStatus | null>
  failedManualAccountIds: string[]
  externalCheckInAccounts: DisplaySiteData[]
  accountInfoById: Record<string, DisplaySiteData>
}) {
  const { t } = useTranslation(["autoCheckin", "messages", "account", "common"])
  const [isOpeningFailedManualSignIns, setIsOpeningFailedManualSignIns] =
    useState(false)
  const [isOpeningExternalCheckIns, setIsOpeningExternalCheckIns] =
    useState(false)
  const [disablingAccountId, setDisablingAccountId] = useState<string | null>(
    null,
  )
  const [pendingOpeningSiteAccountIds, setPendingOpeningSiteAccountIds] =
    useState<Set<string>>(() => new Set())
  const [openingManualAccountId, setOpeningManualAccountId] = useState<
    string | null
  >(null)
  const [openingExternalCheckInAccountId, setOpeningExternalCheckInAccountId] =
    useState<string | null>(null)
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null,
  )
  const [deleteDialogAccount, setDeleteDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const openAccountSiteForAccount = useCallback(
    async (accountId: string) => {
      const displayData = await resolveAutoCheckinAccount(accountId, {
        includeDisabled: true,
      })
      await openAccountBaseUrl(displayData)
    },
    [resolveAutoCheckinAccount],
  )

  const openManualSignInForAccount = useCallback(
    async (accountId: string) => {
      const displayData = await resolveAutoCheckinAccount(accountId)
      await openCheckInPage(displayData)
    },
    [resolveAutoCheckinAccount],
  )

  const handleOpenAccountSite = async (accountId: string) => {
    const completeOpenAccountSiteAnalytics = (
      result: ProductAnalyticsResult,
      errorCategory?: typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    ) => {
      void trackProductAnalyticsActionCompleted({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinAccountSite,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result,
        ...(errorCategory ? { errorCategory } : {}),
        insights: {
          targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ExternalSite,
        },
      })
    }

    try {
      setPendingOpeningSiteAccountIds((prev) => {
        const next = new Set(prev)
        next.add(accountId)
        return next
      })
      await openAccountSiteForAccount(accountId)
      completeOpenAccountSiteAnalytics(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error: unknown) {
      toast.error(
        t("messages.error.openSiteFailed", { error: getErrorMessage(error) }),
      )
      completeOpenAccountSiteAnalytics(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      )
    } finally {
      setPendingOpeningSiteAccountIds((prev) => {
        const next = new Set(prev)
        next.delete(accountId)
        return next
      })
    }
  }

  const handleOpenManualSignIn = async (accountId: string) => {
    const completeOpenManualSignInAnalytics = (
      result: ProductAnalyticsResult,
      errorCategory?: typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    ) => {
      void trackProductAnalyticsActionCompleted({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinManualSignIn,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result,
        ...(errorCategory ? { errorCategory } : {}),
        insights: {
          targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ManualSignIn,
        },
      })
    }

    try {
      setOpeningManualAccountId(accountId)
      await openManualSignInForAccount(accountId)
      completeOpenManualSignInAnalytics(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error: unknown) {
      toast.error(
        t("messages.error.openManualFailed", { error: getErrorMessage(error) }),
      )
      completeOpenManualSignInAnalytics(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      )
    } finally {
      setOpeningManualAccountId(null)
    }
  }

  const handleDisableAccount = async (accountId: string) => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DisableAutoCheckinAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      setDisablingAccountId(accountId)
      const displayData = await resolveAutoCheckinAccount(accountId, {
        includeDisabled: true,
      })
      const success = await accountMutations.setAccountDisabled(accountId, true)

      if (!success) {
        toast.error(t("messages:toast.error.operationFailedGeneric"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        return
      }

      await loadStatus()
      toast.success(
        t("messages:toast.success.accountDisabled", {
          accountName: displayData.name,
        }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error: unknown) {
      toast.error(
        t("messages:toast.error.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      setDisablingAccountId(null)
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    try {
      setDeletingAccountId(accountId)
      const displayData = await resolveAutoCheckinAccount(accountId, {
        includeDisabled: true,
      })
      setDeleteDialogAccount(displayData)
    } catch (error: unknown) {
      toast.error(
        t("messages:toast.error.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setDeletingAccountId(null)
    }
  }

  const handleOpenFailedManualSignIns = async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const { openInNewWindow } = getExternalCheckInOpenOptions(event)
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenFailedAutoCheckinManualSignIns,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    if (!failedManualAccountIds.length) {
      toast.error(t("messages.error.openFailedManualNone"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        insights: {
          itemCount: 0,
          selectedCount: 0,
          successCount: 0,
          failureCount: 0,
        },
      })
      return
    }

    const completeBulkManualOpen = (
      result: ProductAnalyticsResult,
      openedCount: number,
      failedCount: number,
    ) => {
      tracker.complete(result, {
        ...(result === PRODUCT_ANALYTICS_RESULTS.Failure
          ? { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }
          : {}),
        insights: {
          itemCount: failedManualAccountIds.length,
          selectedCount: failedManualAccountIds.length,
          successCount: openedCount,
          failureCount: failedCount,
        },
      })
    }

    try {
      setIsOpeningFailedManualSignIns(true)
      toast.loading(
        t("messages.loading.openingFailedManual", {
          count: failedManualAccountIds.length,
        }),
      )

      let openedCount = 0
      let failedCount = 0
      const accountsToOpen: DisplaySiteData[] = []

      // Best-effort bulk open: one failing account should not block the rest.
      for (const accountId of failedManualAccountIds) {
        try {
          accountsToOpen.push(await resolveAutoCheckinAccount(accountId))
        } catch (error) {
          failedCount += 1
          logger.warn(
            "Failed to resolve manual sign-in page during bulk action",
            {
              accountId,
              error,
            },
          )
        }
      }

      if (accountsToOpen.length > 0) {
        const openResult = await openCheckInPages(accountsToOpen, {
          openInNewWindow,
        })
        openedCount += openResult.openedCount
        failedCount += openResult.failedCount
      }

      toast.dismiss()

      if (failedCount === 0) {
        toast.success(
          t("messages.success.openFailedManualCompleted", {
            count: openedCount,
          }),
        )
        completeBulkManualOpen(
          PRODUCT_ANALYTICS_RESULTS.Success,
          openedCount,
          0,
        )
        return
      }

      if (openedCount > 0) {
        toast.error(
          t("messages.error.openFailedManualPartial", {
            openedCount,
            failedCount,
          }),
        )
        completeBulkManualOpen(
          PRODUCT_ANALYTICS_RESULTS.Failure,
          openedCount,
          failedCount,
        )
        return
      }

      toast.error(
        t("messages.error.openFailedManualFailed", {
          failedCount,
        }),
      )
      completeBulkManualOpen(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        openedCount,
        failedCount,
      )
    } catch (error) {
      toast.dismiss()
      logger.error(
        "Unexpected failure while bulk-opening manual sign-ins",
        error,
      )
      toast.error(
        t("messages.error.openFailedManualFailed", {
          failedCount: failedManualAccountIds.length,
        }),
      )
      completeBulkManualOpen(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        0,
        failedManualAccountIds.length,
      )
    } finally {
      setIsOpeningFailedManualSignIns(false)
    }
  }

  const refreshExternalCheckInAccounts = async (
    accountsToOpen: DisplaySiteData[],
  ) => {
    await Promise.allSettled(
      accountsToOpen.map((account) => resolveAutoCheckinAccount(account.id)),
    )
  }

  const getExternalCheckInPartialFailureMessage = (
    failedCount: number,
    totalCount: number,
  ) =>
    t("messages:toast.error.externalCheckInPartialFailed", {
      count: failedCount,
      failedCount,
      totalCount,
    })

  const handleOpenExternalCheckIns = async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (isOpeningExternalCheckIns) {
      return
    }

    const { openAll, openInNewWindow } = getExternalCheckInOpenOptions(event)

    setIsOpeningExternalCheckIns(true)
    let result: Awaited<ReturnType<typeof openExternalCheckIns>> | undefined
    try {
      result = await openExternalCheckIns(externalCheckInAccounts, {
        openAll,
        openInNewWindow,
        analyticsContext: {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAllExternalCheckIns,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
        onSkipped: () => {
          toast.error(t("messages:toast.error.externalCheckInNonePending"))
        },
        onSuccess: refreshExternalCheckInAccounts,
        onPartialFailure: (failedCount, totalCount) => {
          toast.error(
            getExternalCheckInPartialFailureMessage(failedCount, totalCount),
          )
        },
        onFailure: (error) => {
          logger.error("Error opening external check-ins", error)
          toast.error(
            t("messages:errors.operation.failed", {
              error: getErrorMessage(error),
            }),
          )
        },
      })
    } finally {
      setIsOpeningExternalCheckIns(false)
    }

    if (!result || result.skipped || result.partialFailure || result.failed) {
      return
    }

    toast.success(
      t("messages:toast.success.externalCheckInOpened", {
        count: result.openedAccountCount,
        mode: openAll
          ? t("messages:toast.success.externalCheckInModeAll")
          : t("messages:toast.success.externalCheckInModeUnchecked"),
      }),
    )
  }

  const handleOpenAccountExternalCheckIn = async (accountId: string) => {
    if (openingExternalCheckInAccountId) {
      return
    }

    const account = accountInfoById[accountId]
    if (!account) {
      return
    }

    setOpeningExternalCheckInAccountId(accountId)
    let result: Awaited<ReturnType<typeof openExternalCheckIns>> | undefined
    try {
      result = await openExternalCheckIns([account], {
        openAll: true,
        analyticsContext: {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinAccountExternalCheckIn,
          surfaceId:
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
        onSkipped: () => {
          toast.error(t("messages:toast.error.externalCheckInNonePending"))
        },
        onSuccess: refreshExternalCheckInAccounts,
        onPartialFailure: (failedCount, totalCount) => {
          toast.error(
            getExternalCheckInPartialFailureMessage(failedCount, totalCount),
          )
        },
        onFailure: (error) => {
          logger.error("Error opening account external check-in", error)
          toast.error(
            t("messages:errors.operation.failed", {
              error: getErrorMessage(error),
            }),
          )
        },
      })
    } finally {
      setOpeningExternalCheckInAccountId(null)
    }

    if (!result || result.skipped || result.partialFailure || result.failed) {
      return
    }

    toast.success(
      t("messages:toast.success.externalCheckInOpened", {
        count: result.openedAccountCount,
        mode: t("messages:toast.success.externalCheckInModeAll"),
      }),
    )
  }

  return {
    isOpeningFailedManualSignIns,
    isOpeningExternalCheckIns,
    disablingAccountId,
    pendingOpeningSiteAccountIds,
    openingManualAccountId,
    openingExternalCheckInAccountId,
    deletingAccountId,
    deleteDialogAccount,
    setDeleteDialogAccount,
    handleOpenAccountSite,
    handleOpenManualSignIn,
    handleDisableAccount,
    handleDeleteAccount,
    handleOpenFailedManualSignIns,
    handleOpenExternalCheckIns,
    handleOpenAccountExternalCheckIn,
  }
}
