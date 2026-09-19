import { CalendarCheck2 } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import { useTranslation } from "react-i18next"

import { AutoCheckinPretriggerCompletionDialog } from "~/components/AutoCheckinPretriggerCompletionDialog"
import { AutoCheckinRiskHint } from "~/components/AutoCheckinRiskHint"
import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import DelAccountDialog from "~/features/AccountManagement/components/DelAccountDialog"
import { openExternalCheckIns } from "~/features/AccountManagement/utils/openExternalCheckIns"
import { useRegisterDevPanelSection } from "~/features/DevPanel"
import toast from "~/lib/notify"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { isAutomaticCheckInConfiguredForAccount } from "~/services/checkin/autoCheckin/inspection"
import {
  sendAutoCheckinMessage,
  type AutoCheckinBasicResponse,
} from "~/services/checkin/autoCheckin/messaging"
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
  PRODUCT_ANALYTICS_TARGET_KINDS,
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/contracts"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { DisplaySiteData } from "~/types"
import {
  AUTO_CHECKIN_RUN_RESULT,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinRunSummary,
  type AutoCheckinStatus,
} from "~/types/autoCheckin"
import { onRuntimeMessage } from "~/utils/browser/browserApi"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { getExternalCheckInOpenOptions } from "~/utils/core/shortcutKeys"
import {
  navigateWithinOptionsPage,
  openAccountBaseUrl,
  openCheckInPage,
  openCheckInPages,
  pushWithinOptionsPage,
} from "~/utils/navigation"

import AccountSnapshotTable from "./components/AccountSnapshotTable"
import ActionBar from "./components/ActionBar"
import AutoCheckinDataWorkspace from "./components/AutoCheckinDataWorkspace"
import EmptyResults from "./components/EmptyResults"
import LoadingSkeleton from "./components/LoadingSkeleton"
import ResultsTable from "./components/ResultsTable"
import StatusCard from "./components/StatusCard"
import { useAutoCheckinDevSection } from "./useAutoCheckinDevSection"

/**
 * Unified logger scoped to the Auto Check-in options page.
 */
const logger = createLogger("AutoCheckinOptionsPage")

const getAutoCheckinSummaryAnalyticsInsights = (
  summary?: AutoCheckinRunSummary | null,
) => {
  if (!summary) return undefined

  return {
    itemCount: summary.executed,
    successCount: summary.successCount,
    failureCount: summary.failedCount,
    skippedCount: summary.skippedCount,
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
  const skippedCount = results.filter(
    (result) => result.status === CHECKIN_RESULT_STATUS.SKIPPED,
  ).length

  return {
    itemCount: results.length,
    successCount,
    failureCount,
    skippedCount,
  }
}

const isSkippedAutoCheckinResponse = (
  response: AutoCheckinBasicResponse,
): boolean => {
  const summary = response.success ? response.summary : undefined
  if (!summary) {
    return false
  }

  return response.success === true && summary.executed === 0
}

const getRetryAnalyticsResult = (
  response: AutoCheckinBasicResponse,
): ProductAnalyticsResult => {
  if (!response?.success) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }

  if (response.lastRunResult === AUTO_CHECKIN_RUN_RESULT.FAILED) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }

  if (response.lastRunResult === AUTO_CHECKIN_RUN_RESULT.SKIPPED) {
    return PRODUCT_ANALYTICS_RESULTS.Skipped
  }

  if (!response.lastRunResult && response.pendingRetry) {
    return PRODUCT_ANALYTICS_RESULTS.Skipped
  }

  return PRODUCT_ANALYTICS_RESULTS.Success
}

/**
 * Resolves saved-account setup state for auto check-in empty-state guidance.
 */
async function resolveAutoCheckinAccountSetupState(): Promise<
  "ready" | "no_accounts" | "no_detection_accounts" | null
> {
  try {
    const accounts = await accountQueries.getAllAccounts()
    const enabledAccounts = accounts.filter(
      (account) => account.disabled !== true,
    )

    if (enabledAccounts.length === 0) {
      return "no_accounts"
    }

    return enabledAccounts.some((account) =>
      isAutomaticCheckInConfiguredForAccount({
        config: account.checkIn,
        siteType: account.site_type,
        siteUrl: account.site_url,
        accountDisabled: account.disabled,
      }),
    )
      ? "ready"
      : "no_detection_accounts"
  } catch (error) {
    logger.warn("Failed to load accounts for auto check-in empty state", error)
    return null
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
  const autoCheckinEnabled = autoCheckinPreferences.globalEnabled !== false
  const routeParams = props.routeParams
  const QUICK_RUN_PARAM = "runNow" as const
  const QUICK_RUN_VALUE = "true" as const
  const [status, setStatus] = useState<AutoCheckinStatus | null>(null)
  const [accountSetupState, setAccountSetupState] = useState<
    "ready" | "no_accounts" | "no_detection_accounts" | null
  >(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [isOpeningFailedManualSignIns, setIsOpeningFailedManualSignIns] =
    useState(false)
  const [isOpeningExternalCheckIns, setIsOpeningExternalCheckIns] =
    useState(false)
  const [retryingAccountId, setRetryingAccountId] = useState<string | null>(
    null,
  )
  const [verifyingAccountId, setVerifyingAccountId] = useState<string | null>(
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
  const [openingExternalCheckInAccountId, setOpeningExternalCheckInAccountId] =
    useState<string | null>(null)
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null,
  )
  const [deleteDialogAccount, setDeleteDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const [accountInfoById, setAccountInfoById] = useState<
    Record<string, DisplaySiteData>
  >({})
  const activeStatusLoadCountRef = useRef(0)
  const latestStatusLoadIdRef = useRef(0)
  const attemptedAccountInfoIdsRef = useRef<Set<string>>(new Set())

  // Dev-only: diagnostics and simulation state for the UI-open pre-trigger flow.
  // These controls are shown only in development mode.
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
  const manualCheckinInFlightRef = useRef(false)

  const loadStatus = useCallback(async () => {
    const loadId = latestStatusLoadIdRef.current + 1
    latestStatusLoadIdRef.current = loadId
    activeStatusLoadCountRef.current += 1

    try {
      setIsLoading(true)
      const [response, nextAccountSetupState] = await Promise.all([
        sendAutoCheckinMessage(AutoCheckinMessageTypes.GetStatus),
        resolveAutoCheckinAccountSetupState(),
      ])

      if (loadId === latestStatusLoadIdRef.current) {
        setAccountSetupState(nextAccountSetupState)

        if (response.success) {
          setStatus(response.data)
        }
      }

      if (response.success) {
        return response.data as AutoCheckinStatus
      }
    } catch (error) {
      logger.error("Failed to load status", error)
    } finally {
      activeStatusLoadCountRef.current -= 1
      if (activeStatusLoadCountRef.current === 0) {
        setIsLoading(false)
      }
    }

    return null
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  // Dev-only alarm/pretrigger controls moved into the floating dev panel.
  const autoCheckinDevSection = useAutoCheckinDevSection({
    refreshStatus: loadStatus,
    onShowUiOpenPretriggerDiagnostics: (payload) =>
      setUiOpenPretriggerDiagnostics({ isOpen: true, payload }),
    onShowUiOpenPretriggerCompletion: setUiOpenPretriggerCompletion,
  })
  useRegisterDevPanelSection(autoCheckinDevSection)

  useEffect(() => {
    return onRuntimeMessage((message) => {
      if (message?.action === RuntimeActionIds.AutoCheckinRunCompleted) {
        void loadStatus()
      }
    })
  }, [loadStatus])

  const handleRunNow = useCallback(async () => {
    if (manualCheckinInFlightRef.current) return
    manualCheckinInFlightRef.current = true
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      setIsRunning(true)
      toast.loading(t("messages.loading.running"))

      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      const response = await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        tempWindowRequestSource,
        (protectionBypassExecution) =>
          sendAutoCheckinMessage(AutoCheckinMessageTypes.RunNow, {
            protectionBypassExecution,
          }),
      )

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.runCompleted"))
        const updatedStatus = await loadStatus()
        tracker.complete(
          isSkippedAutoCheckinResponse(response)
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
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.runFailed", { error: getErrorMessage(error) }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      manualCheckinInFlightRef.current = false
      setIsRunning(false)
    }
  }, [loadStatus, t])

  const showDebugButtons = isDevelopmentMode()

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
  const accountResults = useMemo(
    () => (status?.perAccount ? Object.values(status.perAccount) : []),
    [status?.perAccount],
  )
  const failedManualAccountIds = accountResults
    .filter((result) => result.status === CHECKIN_RESULT_STATUS.FAILED)
    .map((result) => result.accountId)
  const accountResultIds = useMemo(
    () => accountResults.map((result) => result.accountId),
    [accountResults],
  )
  const externalCheckInAccounts = useMemo(
    () =>
      accountResultIds
        .map((accountId) => accountInfoById[accountId])
        .filter((account): account is DisplaySiteData => {
          const customUrl = account?.checkIn?.customCheckIn?.url
          return typeof customUrl === "string" && customUrl.trim() !== ""
        }),
    [accountInfoById, accountResultIds],
  )
  const canOpenExternalCheckIns = externalCheckInAccounts.length > 0
  const externalCheckInAccountIds = useMemo(
    () => new Set(externalCheckInAccounts.map((account) => account.id)),
    [externalCheckInAccounts],
  )

  const handleRefresh = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAutoCheckinStatus,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      setIsManualRefreshing(true)
      const updatedStatus = await loadStatus()
      tracker.complete(
        updatedStatus
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          ...(updatedStatus
            ? {
                insights: getAutoCheckinStatusAnalyticsInsights(updatedStatus),
              }
            : {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              }),
        },
      )
    } finally {
      setIsManualRefreshing(false)
    }
  }

  const handleOpenAccountManagement = () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinAccountSetup,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinEmptyState,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
      },
    })
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }

  const handleRetryAccount = async (accountId: string) => {
    if (manualCheckinInFlightRef.current) return
    manualCheckinInFlightRef.current = true
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryAutoCheckinAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      setRetryingAccountId(accountId)
      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      const response = await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.RetryCheckinAccount,
        tempWindowRequestSource,
        (protectionBypassExecution) =>
          sendAutoCheckinMessage(AutoCheckinMessageTypes.RetryAccount, {
            accountId,
            protectionBypassExecution,
          }),
      )

      if (response.success) {
        toast.success(t("messages.success.retryCompleted"))
        const updatedStatus = await loadStatus()
        const responseSummary = response.success ? response.summary : undefined
        tracker.complete(getRetryAnalyticsResult(response), {
          insights:
            getAutoCheckinSummaryAnalyticsInsights(responseSummary) ??
            getAutoCheckinStatusAnalyticsInsights(updatedStatus),
        })
      } else {
        toast.error(
          t("messages.error.retryFailed", { error: response.error ?? "" }),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } catch (error: unknown) {
      toast.error(
        t("messages.error.retryFailed", { error: getErrorMessage(error) }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      manualCheckinInFlightRef.current = false
      setRetryingAccountId(null)
    }
  }

  const handleVerifyAccountStatus = async (accountId: string) => {
    if (manualCheckinInFlightRef.current) return
    manualCheckinInFlightRef.current = true
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyAutoCheckinAccountStatus,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      setVerifyingAccountId(accountId)
      const response = await sendAutoCheckinMessage(
        AutoCheckinMessageTypes.VerifyAccountStatus,
        { accountId },
      )
      if (response.success) {
        toast.success(t("messages.success.statusVerified"))
        let updatedStatus: AutoCheckinStatus | null = null
        try {
          updatedStatus = await loadStatus()
          await resolveAutoCheckinAccount(accountId, { includeDisabled: true })
        } catch (error: unknown) {
          logger.warn(
            "Status verification succeeded but the account view refresh failed",
            { accountId, error },
          )
        }
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: getAutoCheckinStatusAnalyticsInsights(updatedStatus),
        })
      } else {
        toast.error(t("messages.error.statusVerificationFailed"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } catch {
      toast.error(t("messages.error.statusVerificationFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      manualCheckinInFlightRef.current = false
      setVerifyingAccountId(null)
    }
  }

  const resolveAutoCheckinAccount = useCallback(
    async (
      accountId: string,
      options?: { includeDisabled?: boolean },
    ): Promise<DisplaySiteData> => {
      const response = await sendAutoCheckinMessage(
        AutoCheckinMessageTypes.GetAccountInfo,
        {
          accountId,
          ...(typeof options?.includeDisabled !== "undefined"
            ? { includeDisabled: options.includeDisabled }
            : {}),
        },
      )

      if (!response.success) {
        throw new Error(response.error || "Unknown error")
      }

      const displayData = response.data as DisplaySiteData | undefined
      if (!displayData) {
        throw new Error("Account info not found")
      }

      setAccountInfoById((prev) =>
        prev[accountId] === displayData
          ? prev
          : {
              ...prev,
              [accountId]: displayData,
            },
      )
      return displayData
    },
    [],
  )

  useEffect(() => {
    const missingAccountIds = accountResultIds.filter(
      (accountId) =>
        !accountInfoById[accountId] &&
        !attemptedAccountInfoIdsRef.current.has(accountId),
    )

    if (!missingAccountIds.length) {
      return
    }

    let cancelled = false
    // A failed display lookup must not be retried on every status update.
    // Explicit account actions still perform their own fresh lookup.
    for (const accountId of missingAccountIds) {
      attemptedAccountInfoIdsRef.current.add(accountId)
    }

    void Promise.allSettled(
      missingAccountIds.map((accountId) =>
        resolveAutoCheckinAccount(accountId, { includeDisabled: true }),
      ),
    ).then((results) => {
      if (cancelled) return

      const loadedAccounts = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      )

      if (!loadedAccounts.length) {
        return
      }

      setAccountInfoById((prev) => ({
        ...prev,
        ...Object.fromEntries(
          loadedAccounts.map((account) => [account.id, account]),
        ),
      }))
    })

    return () => {
      cancelled = true
    }
  }, [accountInfoById, accountResultIds, resolveAutoCheckinAccount])

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

  const isInitialLoading = isLoading && status === null

  if (isInitialLoading) {
    return <LoadingSkeleton />
  }

  const hasHistory = accountResults.length > 0
  const snapshots = status?.accountsSnapshot ?? []
  const resultsContent = hasHistory ? (
    <ResultsTable
      results={accountResults}
      showDevActions={showDebugButtons}
      retryingAccountId={retryingAccountId}
      verifyingAccountId={verifyingAccountId}
      disablingAccountId={disablingAccountId}
      deletingAccountId={deletingAccountId}
      pendingOpeningSiteAccountIds={pendingOpeningSiteAccountIds}
      openingManualAccountId={openingManualAccountId}
      openingExternalCheckInAccountId={openingExternalCheckInAccountId}
      onRetryAccount={handleRetryAccount}
      onVerifyAccountStatus={handleVerifyAccountStatus}
      onDisableAccount={handleDisableAccount}
      onDeleteAccount={handleDeleteAccount}
      onOpenAccountSite={handleOpenAccountSite}
      onOpenManualSignIn={handleOpenManualSignIn}
      externalCheckInAccountIds={externalCheckInAccountIds}
      onOpenExternalCheckIn={handleOpenAccountExternalCheckIn}
    />
  ) : (
    <EmptyResults
      hasHistory={false}
      setupState={accountSetupState ?? "ready"}
      onOpenAccounts={handleOpenAccountManagement}
    />
  )

  const actionBar = (
    <ActionBar
      isRunning={isRunning}
      isRefreshing={isManualRefreshing}
      isRefreshLocked={isLoading}
      isOpeningFailedManualSignIns={isOpeningFailedManualSignIns}
      isOpeningExternalCheckIns={isOpeningExternalCheckIns}
      canOpenFailedManualSignIns={failedManualAccountIds.length > 0}
      canOpenExternalCheckIns={canOpenExternalCheckIns}
      onRunNow={handleRunNow}
      onRefresh={handleRefresh}
      onOpenFailedManualSignIns={handleOpenFailedManualSignIns}
      onOpenExternalCheckIns={handleOpenExternalCheckIns}
    />
  )

  return (
    <div className="py-density-6 px-6">
      <PageHeader
        icon={CalendarCheck2}
        title={
          autoCheckinEnabled ? t("execution.title") : t("execution.manualTitle")
        }
        titleActions={
          <>
            <AutoCheckinRiskHint />
            <OptionsPageSettingsTitleAction
              tabId="checkinRedeem"
              anchor="auto-checkin"
            />
          </>
        }
        description={
          autoCheckinEnabled ? t("description") : t("manualDescription")
        }
        spacing="compact"
      />

      <div className="space-y-density-4">
        {status ? (
          <StatusCard
            status={status}
            preferences={autoCheckinPreferences}
            actions={actionBar}
          />
        ) : (
          actionBar
        )}

        {snapshots.length > 0 ? (
          <AutoCheckinDataWorkspace
            hasHistory={hasHistory}
            results={accountResults}
            snapshots={snapshots}
            resultsContent={resultsContent}
            readinessContent={<AccountSnapshotTable snapshots={snapshots} />}
          />
        ) : (
          resultsContent
        )}
      </div>

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
          <div className="text-foreground text-lg font-semibold">
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
        <div className="space-y-density-3">
          <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
            {t("execution.debug.uiOpenPretriggerDiagnosticsDesc")}
          </p>
          <pre className="dark:bg-secondary border-border bg-surface-subtle text-secondary-foreground py-density-3 max-h-[60vh] overflow-auto rounded-lg border px-3 text-xs md:max-h-[min(70vh,48rem)]">
            {uiOpenPretriggerDiagnostics.payload
              ? JSON.stringify(uiOpenPretriggerDiagnostics.payload, null, 2)
              : ""}
          </pre>
        </div>
      </Modal>
    </div>
  )
}
