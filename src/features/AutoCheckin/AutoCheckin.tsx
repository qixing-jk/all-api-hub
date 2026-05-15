import { CalendarCheck2 } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { AutoCheckinPretriggerCompletionDialog } from "~/components/AutoCheckinPretriggerCompletionDialog"
import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import DelAccountDialog from "~/features/AccountManagement/components/DelAccountDialog"
import { translateAutoCheckinMessageKey } from "~/features/AutoCheckin/utils/autoCheckin"
import { accountStorage } from "~/services/accounts/accountStorage"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
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
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/events"
import type { DisplaySiteData } from "~/types"
import {
  AutoCheckinRunSummary,
  AutoCheckinStatus,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import {
  onRuntimeMessage,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { getExternalCheckInOpenOptions } from "~/utils/core/shortcutKeys"
import {
  navigateWithinOptionsPage,
  openAccountBaseUrl,
  openCheckInPage,
  openCheckInPages,
} from "~/utils/navigation"

import AccountSnapshotTable from "./components/AccountSnapshotTable"
import ActionBar from "./components/ActionBar"
import EmptyResults from "./components/EmptyResults"
import FilterBar, {
  FILTER_STATUS,
  type FilterStatus,
} from "./components/FilterBar"
import LoadingSkeleton from "./components/LoadingSkeleton"
import ResultsTable from "./components/ResultsTable"
import StatusCard from "./components/StatusCard"

/**
 * Unified logger scoped to the Auto Check-in options page.
 */
const logger = createLogger("AutoCheckinOptionsPage")

type ProductAnalyticsActionTracker = ReturnType<
  typeof startProductAnalyticsAction
>

const getAutoCheckinSummaryAnalyticsInsights = (
  summary?: AutoCheckinRunSummary | null,
) => {
  if (!summary) return undefined

  return {
    itemCount: summary.executed,
    successCount: summary.successCount,
    failureCount: summary.failedCount,
  }
}

const getAutoCheckinStatusAnalyticsInsights = (
  status?: AutoCheckinStatus | null,
) => {
  const summaryInsights = getAutoCheckinSummaryAnalyticsInsights(
    status?.summary,
  )

  if (summaryInsights) return summaryInsights

  const results = status?.perAccount ? Object.values(status.perAccount) : []
  if (results.length === 0) return undefined

  const successCount = results.filter(
    (result) =>
      result.status === CHECKIN_RESULT_STATUS.SUCCESS ||
      result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ).length
  const failureCount = results.filter(
    (result) => result.status === CHECKIN_RESULT_STATUS.FAILED,
  ).length

  return {
    itemCount: successCount + failureCount,
    successCount,
    failureCount,
  }
}

const isNoRunnableAutoCheckinResponse = (response: any): boolean => {
  const summary = response?.summary

  return (
    response?.success === true &&
    summary &&
    summary.executed === 0 &&
    summary.totalEligible === 0
  )
}

const getRetryAnalyticsResult = (response: any): ProductAnalyticsResult => {
  if (!response?.success) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }

  if (response?.result?.status === CHECKIN_RESULT_STATUS.SKIPPED) {
    return PRODUCT_ANALYTICS_RESULTS.Skipped
  }

  return PRODUCT_ANALYTICS_RESULTS.Success
}

const completeAutoCheckinAnalytics = async (
  tracker: ProductAnalyticsActionTracker,
  result: ProductAnalyticsResult,
  options?: Parameters<ProductAnalyticsActionTracker["complete"]>[1],
) => {
  try {
    if (options) {
      await tracker.complete(result, options)
      return
    }

    await tracker.complete(result)
  } catch (error) {
    // Product analytics must not block user-triggered check-in actions.
    logger.warn("Auto check-in analytics completion failed", error)
  }
}

/**
 * Auto Check-in dashboard page: fetches status, runs jobs, filters/searches results, and shows snapshots.
 */
export default function AutoCheckin(props: {
  routeParams?: Record<string, string>
}) {
  const { t } = useTranslation(["autoCheckin", "messages", "account", "common"])
  const { preferences: userPrefs } = useUserPreferencesContext()
  const autoCheckinPreferences =
    userPrefs?.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
  const routeParams = props.routeParams
  const QUICK_RUN_PARAM = "runNow" as const
  const QUICK_RUN_VALUE = "true" as const
  const [status, setStatus] = useState<AutoCheckinStatus | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(
    FILTER_STATUS.ALL,
  )
  const [searchKeyword, setSearchKeyword] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [isDebugTriggering, setIsDebugTriggering] = useState(false)
  const [isOpeningFailedManualSignIns, setIsOpeningFailedManualSignIns] =
    useState(false)
  const [retryingAccountId, setRetryingAccountId] = useState<string | null>(
    null,
  )
  const [disablingAccountId, setDisablingAccountId] = useState<string | null>(
    null,
  )
  const [pendingOpeningSiteAccountIds, setPendingOpeningSiteAccountIds] =
    useState<Set<string>>(() => new Set())
  const [openingManualAccountId, setOpeningManualAccountId] = useState<
    string | null
  >(null)
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null,
  )
  const [deleteDialogAccount, setDeleteDialogAccount] =
    useState<DisplaySiteData | null>(null)

  // Dev-only: diagnostics and simulation state for the UI-open pre-trigger flow.
  // These controls are shown only when `import.meta.env.MODE === "development"`.
  const [uiOpenPretriggerDiagnostics, setUiOpenPretriggerDiagnostics] =
    useState<{
      isOpen: boolean
      payload: any | null
    }>({ isOpen: false, payload: null })

  const [uiOpenPretriggerCompletion, setUiOpenPretriggerCompletion] = useState<{
    isOpen: boolean
    summary: AutoCheckinRunSummary | null
    pendingRetry: boolean
  }>({
    isOpen: false,
    summary: null,
    pendingRetry: false,
  })

  const quickRunTriggeredRef = useRef(false)

  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinGetStatus,
      })

      if (response.success) {
        setStatus(response.data)
        return response.data as AutoCheckinStatus
      }
    } catch (error) {
      logger.error("Failed to load status", error)
    } finally {
      setIsLoading(false)
    }

    return null
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    return onRuntimeMessage((message) => {
      if (message?.action === RuntimeActionIds.AutoCheckinRunCompleted) {
        void loadStatus()
      }
    })
  }, [loadStatus])

  const handleRunNow = useCallback(async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      setIsRunning(true)
      toast.loading(t("messages.loading.running"))

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinRunNow,
      })

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.runCompleted"))
        const updatedStatus = await loadStatus()
        await completeAutoCheckinAnalytics(
          tracker,
          isNoRunnableAutoCheckinResponse(response)
            ? PRODUCT_ANALYTICS_RESULTS.Skipped
            : PRODUCT_ANALYTICS_RESULTS.Success,
          {
            insights:
              getAutoCheckinSummaryAnalyticsInsights(response.summary) ??
              getAutoCheckinStatusAnalyticsInsights(updatedStatus),
          },
        )
      } else {
        toast.error(t("messages.error.runFailed", { error: response.error }))
        await completeAutoCheckinAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Failure,
          {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          },
        )
      }
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.runFailed", { error: getErrorMessage(error) }),
      )
      await completeAutoCheckinAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    } finally {
      setIsRunning(false)
    }
  }, [loadStatus, t])

  const showDebugButtons = import.meta.env.MODE === "development"

  const handleDebugTriggerDailyAlarmNow = useCallback(async () => {
    try {
      setIsDebugTriggering(true)
      toast.loading(t("messages.loading.triggeringDailyAlarm"))

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinDebugTriggerDailyAlarmNow,
      })

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.dailyAlarmTriggered"))
        await loadStatus()
      } else {
        toast.error(
          t("messages.error.dailyAlarmTriggerFailed", {
            error: response.error ?? "",
          }),
        )
      }
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.dailyAlarmTriggerFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsDebugTriggering(false)
    }
  }, [loadStatus, t])

  const handleDebugTriggerRetryAlarmNow = useCallback(async () => {
    try {
      setIsDebugTriggering(true)
      toast.loading(t("messages.loading.triggeringRetryAlarm"))

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinDebugTriggerRetryAlarmNow,
      })

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.retryAlarmTriggered"))
        await loadStatus()
      } else {
        toast.error(
          t("messages.error.retryAlarmTriggerFailed", {
            error: response.error ?? "",
          }),
        )
      }
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.retryAlarmTriggerFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsDebugTriggering(false)
    }
  }, [loadStatus, t])

  // Dev-only: schedule the daily alarm to target today so UI-open pre-trigger eligibility can be tested.
  const handleDebugScheduleDailyAlarmForToday = useCallback(async () => {
    try {
      setIsDebugTriggering(true)
      toast.loading(t("messages.loading.schedulingDailyAlarmForToday"))

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinDebugScheduleDailyAlarmForToday,
        minutesFromNow: 60,
      })

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.dailyAlarmScheduledForToday"))
        await loadStatus()
      } else {
        toast.error(
          t("messages.error.dailyAlarmScheduleForTodayFailed", {
            error: response.error ?? "",
          }),
        )
      }
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.dailyAlarmScheduleForTodayFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsDebugTriggering(false)
    }
  }, [loadStatus, t])

  // Dev-only: evaluate eligibility and show the decision inputs without executing the daily run.
  const handleDebugEvaluateUiOpenPretrigger = useCallback(async () => {
    try {
      setIsDebugTriggering(true)
      toast.loading(t("messages.loading.evaluatingUiOpenPretrigger"))

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen,
        dryRun: true,
        debug: true,
      })

      toast.dismiss()

      if (response.success) {
        setUiOpenPretriggerDiagnostics({
          isOpen: true,
          payload: response,
        })

        if (response.eligible) {
          toast.success(t("messages.success.uiOpenPretriggerEligible"))
        } else {
          toast.error(
            t("messages.error.uiOpenPretriggerIneligible", {
              reason: response.ineligibleReason ?? "",
            }),
          )
        }
      } else {
        toast.error(
          t("messages.error.uiOpenPretriggerEvaluationFailed", {
            error: response.error ?? "",
          }),
        )
      }
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.uiOpenPretriggerEvaluationFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsDebugTriggering(false)
    }
  }, [t])

  // Dev-only: trigger the same UI-open pre-trigger entry point on demand and show the completion dialog.
  const handleDebugTriggerUiOpenPretrigger = useCallback(async () => {
    const requestId = safeRandomUUID()
    let unsubscribe = () => {}

    try {
      setIsDebugTriggering(true)
      toast.loading(t("messages.loading.triggeringUiOpenPretrigger"))

      unsubscribe = onRuntimeMessage((message) => {
        if (
          message?.action === "autoCheckinPretrigger:started" &&
          message?.requestId === requestId
        ) {
          toast.success(t("messages.success.pretriggerStarted"))
        }
      })

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen,
        requestId,
        debug: true,
      })

      toast.dismiss()

      if (!response.success) {
        toast.error(
          t("messages.error.uiOpenPretriggerTriggerFailed", {
            error: response.error ?? "",
          }),
        )
        return
      }

      if (!response.started) {
        toast.error(
          t("messages.error.uiOpenPretriggerDidNotStart", {
            reason: response.ineligibleReason ?? "",
          }),
        )
        setUiOpenPretriggerDiagnostics({
          isOpen: true,
          payload: response,
        })
        return
      }

      setUiOpenPretriggerCompletion({
        isOpen: true,
        summary: response.summary ?? null,
        pendingRetry: Boolean(response.pendingRetry),
      })
      await loadStatus()
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.uiOpenPretriggerTriggerFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      unsubscribe()
      setIsDebugTriggering(false)
    }
  }, [loadStatus, t])

  // Dev-only: reset the stored daily marker so the UI-open pre-trigger can be tested again on the same day.
  const handleDebugResetLastDailyRunDay = useCallback(async () => {
    try {
      setIsDebugTriggering(true)
      toast.loading(t("messages.loading.resettingLastDailyRunDay"))

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinDebugResetLastDailyRunDay,
      })

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.lastDailyRunDayReset"))
        await loadStatus()
      } else {
        toast.error(
          t("messages.error.lastDailyRunDayResetFailed", {
            error: response.error ?? "",
          }),
        )
      }
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.lastDailyRunDayResetFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsDebugTriggering(false)
    }
  }, [loadStatus, t])

  useEffect(() => {
    if (quickRunTriggeredRef.current) {
      return
    }

    if (routeParams?.[QUICK_RUN_PARAM] !== QUICK_RUN_VALUE) {
      return
    }

    quickRunTriggeredRef.current = true
    navigateWithinOptionsPage(`#${MENU_ITEM_IDS.AUTO_CHECKIN}`, {
      ...routeParams,
      [QUICK_RUN_PARAM]: undefined,
    })
    void handleRunNow()
  }, [handleRunNow, routeParams])

  // Keep the bulk action tied to the full latest failure set rather than the
  // currently filtered table rows, so "open all failed" has a stable meaning.
  const accountResults = status?.perAccount
    ? Object.values(status.perAccount)
    : []
  const failedManualAccountIds = accountResults
    .filter((result) => result.status === CHECKIN_RESULT_STATUS.FAILED)
    .map((result) => result.accountId)

  const handleRefresh = () => {
    void loadStatus()
  }

  const handleRetryAccount = async (accountId: string) => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryAutoCheckinAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      setRetryingAccountId(accountId)
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinRetryAccount,
        accountId,
      })

      if (response.success) {
        toast.success(t("messages.success.retryCompleted"))
        const updatedStatus = await loadStatus()
        await completeAutoCheckinAnalytics(
          tracker,
          getRetryAnalyticsResult(response),
          {
            insights:
              getAutoCheckinSummaryAnalyticsInsights(response.summary) ??
              getAutoCheckinStatusAnalyticsInsights(updatedStatus),
          },
        )
      } else {
        toast.error(
          t("messages.error.retryFailed", { error: response.error ?? "" }),
        )
        await completeAutoCheckinAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Failure,
          {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          },
        )
      }
    } catch (error: unknown) {
      toast.error(
        t("messages.error.retryFailed", { error: getErrorMessage(error) }),
      )
      await completeAutoCheckinAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    } finally {
      setRetryingAccountId(null)
    }
  }

  const resolveAutoCheckinAccount = useCallback(
    async (
      accountId: string,
      options?: { includeDisabled?: boolean },
    ): Promise<DisplaySiteData> => {
      const message = {
        action: RuntimeActionIds.AutoCheckinGetAccountInfo,
        accountId,
      } as {
        action: typeof RuntimeActionIds.AutoCheckinGetAccountInfo
        accountId: string
        includeDisabled?: boolean
      }

      if (typeof options?.includeDisabled !== "undefined") {
        message.includeDisabled = options.includeDisabled
      }

      const response = await sendRuntimeMessage(message)

      if (!response.success || !response.data) {
        throw new Error(response.error || "Unknown error")
      }

      return response.data as DisplaySiteData
    },
    [],
  )

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
    try {
      setPendingOpeningSiteAccountIds((prev) => {
        const next = new Set(prev)
        next.add(accountId)
        return next
      })
      await openAccountSiteForAccount(accountId)
    } catch (error: unknown) {
      toast.error(
        t("messages.error.openSiteFailed", { error: getErrorMessage(error) }),
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
    try {
      setOpeningManualAccountId(accountId)
      await openManualSignInForAccount(accountId)
    } catch (error: unknown) {
      toast.error(
        t("messages.error.openManualFailed", { error: getErrorMessage(error) }),
      )
    } finally {
      setOpeningManualAccountId(null)
    }
  }

  const handleDisableAccount = async (accountId: string) => {
    const startedAt = Date.now()
    const completeDisableAnalytics = async (
      result: ProductAnalyticsResult,
      options?: {
        errorCategory?: typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
      },
    ) => {
      try {
        await trackProductAnalyticsActionCompleted({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.DisableAutoCheckinAccount,
          surfaceId:
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          result,
          ...(options?.errorCategory
            ? { errorCategory: options.errorCategory }
            : {}),
          durationMs: Date.now() - startedAt,
        })
      } catch (error) {
        // Product analytics must not block disabling failed check-in accounts.
        logger.warn("Auto check-in disable analytics completion failed", error)
      }
    }

    try {
      setDisablingAccountId(accountId)
      const displayData = await resolveAutoCheckinAccount(accountId, {
        includeDisabled: true,
      })
      const success = await accountStorage.setAccountDisabled(accountId, true)

      if (!success) {
        toast.error(t("messages:toast.error.operationFailedGeneric"))
        await completeDisableAnalytics(PRODUCT_ANALYTICS_RESULTS.Failure, {
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
      await completeDisableAnalytics(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error: unknown) {
      toast.error(
        t("messages:toast.error.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
      await completeDisableAnalytics(PRODUCT_ANALYTICS_RESULTS.Failure, {
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

    if (!failedManualAccountIds.length) {
      toast.error(t("messages.error.openFailedManualNone"))
      return
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
        return
      }

      if (openedCount > 0) {
        toast.error(
          t("messages.error.openFailedManualPartial", {
            openedCount,
            failedCount,
          }),
        )
        return
      }

      toast.error(
        t("messages.error.openFailedManualFailed", {
          failedCount,
        }),
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
    } finally {
      setIsOpeningFailedManualSignIns(false)
    }
  }

  const filteredResults = accountResults.filter((result) => {
    // Filter by status
    if (
      filterStatus === FILTER_STATUS.SUCCESS &&
      result.status !== CHECKIN_RESULT_STATUS.SUCCESS &&
      result.status !== CHECKIN_RESULT_STATUS.ALREADY_CHECKED
    )
      return false
    if (
      filterStatus === FILTER_STATUS.FAILED &&
      result.status !== CHECKIN_RESULT_STATUS.FAILED
    )
      return false
    if (
      filterStatus === FILTER_STATUS.SKIPPED &&
      result.status !== CHECKIN_RESULT_STATUS.SKIPPED
    )
      return false

    // Search by keyword
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()

      const displayMessage =
        result.rawMessage ??
        (result.messageKey
          ? translateAutoCheckinMessageKey(
              t,
              result.messageKey,
              result.messageParams,
            )
          : result.message ?? "")
      return (
        result.accountName.toLowerCase().includes(keyword) ||
        String(result.accountId).toLowerCase().includes(keyword) ||
        displayMessage.toLowerCase().includes(keyword)
      )
    }

    return true
  })

  const isInitialLoading = isLoading && status === null

  if (isInitialLoading) {
    return <LoadingSkeleton />
  }

  const hasHistory = accountResults.length > 0
  const hasResults = filteredResults.length > 0

  return (
    <div className="p-6">
      <PageHeader
        icon={CalendarCheck2}
        title={t("execution.title")}
        description={t("description")}
        spacing="compact"
      />

      {status && (
        <div className="mb-6">
          <StatusCard status={status} preferences={autoCheckinPreferences} />
        </div>
      )}

      <div className="mb-6">
        <ActionBar
          isRunning={isRunning}
          isRefreshing={isLoading && status !== null}
          isDebugTriggering={isDebugTriggering}
          isOpeningFailedManualSignIns={isOpeningFailedManualSignIns}
          canOpenFailedManualSignIns={failedManualAccountIds.length > 0}
          onRunNow={handleRunNow}
          onRefresh={handleRefresh}
          onOpenFailedManualSignIns={handleOpenFailedManualSignIns}
          showDebugButtons={showDebugButtons}
          onDebugTriggerDailyAlarmNow={handleDebugTriggerDailyAlarmNow}
          onDebugTriggerRetryAlarmNow={handleDebugTriggerRetryAlarmNow}
          onDebugScheduleDailyAlarmForToday={
            handleDebugScheduleDailyAlarmForToday
          }
          onDebugEvaluateUiOpenPretrigger={handleDebugEvaluateUiOpenPretrigger}
          onDebugTriggerUiOpenPretrigger={handleDebugTriggerUiOpenPretrigger}
          onDebugResetLastDailyRunDay={handleDebugResetLastDailyRunDay}
        />
      </div>

      {hasHistory && (
        <div className="mb-4">
          <FilterBar
            accountResults={accountResults}
            status={filterStatus}
            keyword={searchKeyword}
            onStatusChange={setFilterStatus}
            onKeywordChange={setSearchKeyword}
          />
        </div>
      )}

      {!hasResults ? (
        <EmptyResults hasHistory={hasHistory} />
      ) : (
        <ResultsTable
          results={filteredResults}
          showDevActions={showDebugButtons}
          retryingAccountId={retryingAccountId}
          disablingAccountId={disablingAccountId}
          deletingAccountId={deletingAccountId}
          pendingOpeningSiteAccountIds={pendingOpeningSiteAccountIds}
          openingManualAccountId={openingManualAccountId}
          onRetryAccount={handleRetryAccount}
          onDisableAccount={handleDisableAccount}
          onDeleteAccount={handleDeleteAccount}
          onOpenAccountSite={handleOpenAccountSite}
          onOpenManualSignIn={handleOpenManualSignIn}
        />
      )}

      {status?.accountsSnapshot && status.accountsSnapshot.length > 0 && (
        <div className="mt-6 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t("snapshot.title")}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("snapshot.description")}
            </p>
          </div>
          <AccountSnapshotTable snapshots={status.accountsSnapshot} />
        </div>
      )}

      <AutoCheckinPretriggerCompletionDialog
        isOpen={uiOpenPretriggerCompletion.isOpen}
        summary={uiOpenPretriggerCompletion.summary}
        pendingRetry={uiOpenPretriggerCompletion.pendingRetry}
        onClose={() =>
          setUiOpenPretriggerCompletion((prev) => ({ ...prev, isOpen: false }))
        }
      />

      <DelAccountDialog
        isOpen={deleteDialogAccount !== null}
        onClose={() => setDeleteDialogAccount(null)}
        account={deleteDialogAccount}
        onDeleted={() => {
          void loadStatus()
          setDeleteDialogAccount(null)
        }}
      />

      <Modal
        isOpen={uiOpenPretriggerDiagnostics.isOpen}
        onClose={() =>
          setUiOpenPretriggerDiagnostics({ isOpen: false, payload: null })
        }
        header={
          <div className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
            {t("execution.debug.uiOpenPretriggerDiagnosticsTitle")}
          </div>
        }
        footer={
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setUiOpenPretriggerDiagnostics({ isOpen: false, payload: null })
              }
            >
              {t("uiOpenPretrigger.close")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="dark:text-dark-text-secondary text-sm text-gray-600">
            {t("execution.debug.uiOpenPretriggerDiagnosticsDesc")}
          </p>
          <pre className="dark:bg-dark-bg-tertiary max-h-[60vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 md:max-h-[min(70vh,48rem)] dark:border-gray-700 dark:text-gray-200">
            {uiOpenPretriggerDiagnostics.payload
              ? JSON.stringify(uiOpenPretriggerDiagnostics.payload, null, 2)
              : ""}
          </pre>
        </div>
      </Modal>
    </div>
  )
}
