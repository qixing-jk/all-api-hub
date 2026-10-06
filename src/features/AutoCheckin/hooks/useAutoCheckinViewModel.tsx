import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useRegisterDevPanelSection } from "~/features/DevPanel"
import toast from "~/lib/notify"
import { loginProviderEvidence } from "~/services/accountLogin/providerEvidence"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { refreshAutoCheckinAccountSnapshots } from "~/services/checkin/autoCheckin/accountSnapshot"
import { isAutomaticCheckInConfiguredForAccount } from "~/services/checkin/autoCheckin/inspection"
import {
  sendAutoCheckinMessage,
  type AutoCheckinBasicResponse,
} from "~/services/checkin/autoCheckin/messaging"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
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
import {
  siteTypeObservations,
  type SiteTypeMismatchMap,
} from "~/services/siteDetection/siteTypeObservations"
import type { DisplaySiteData, SiteAccount } from "~/types"
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
import {
  navigateWithinOptionsPage,
  pushWithinOptionsPage,
} from "~/utils/navigation"

import { useAutoCheckinDevSection } from "../useAutoCheckinDevSection"
import { getAutoCheckinResultMessage } from "../utils/autoCheckin"
import { useAutoCheckinRecovery } from "./useAutoCheckinRecovery"

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
 * Loads the saved accounts and the setup state derived from them, for empty-state
 * guidance and for the site-type advice the results table names.
 */
async function loadAutoCheckinAccountSetup(): Promise<{
  state: "ready" | "no_accounts" | "no_detection_accounts" | null
  accounts: SiteAccount[]
}> {
  try {
    const accounts = await accountQueries.getAllAccounts()
    const enabledAccounts = accounts.filter(
      (account) => account.disabled !== true,
    )

    if (enabledAccounts.length === 0) {
      return { state: "no_accounts", accounts }
    }

    const state = enabledAccounts.some((account) =>
      isAutomaticCheckInConfiguredForAccount({
        config: account.checkIn,
        siteType: account.site_type,
        siteUrl: account.site_url,
        accountDisabled: account.disabled,
      }),
    )
      ? "ready"
      : "no_detection_accounts"

    return { state, accounts }
  } catch (error) {
    logger.warn("Failed to load accounts for auto check-in empty state", error)
    return { state: null, accounts: [] }
  }
}
/** Own the feature state and user-command lifecycle consumed by the view. */
export function useAutoCheckinViewModel(props: {
  routeParams?: Record<string, string>
}) {
  const { t } = useTranslation(["autoCheckin", "messages", "account", "common"])
  const { preferences: userPrefs, currencyType } = useUserPreferencesContext()
  const autoCheckinPreferences =
    userPrefs?.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
  const autoCheckinEnabled = autoCheckinPreferences.globalEnabled !== false
  const routeParams = props.routeParams
  const QUICK_RUN_PARAM = "runNow" as const
  const QUICK_RUN_VALUE = "true" as const
  const [status, setStatus] = useState<AutoCheckinStatus | null>(null)
  const [siteTypeMismatches, setSiteTypeMismatches] =
    useState<SiteTypeMismatchMap>({})
  /**
   * Each account's own USD-to-CNY rate, so a reported reward can be shown in
   * the display currency. Accounts missing here are ones this page could not
   * load; their reward stays hidden rather than converted with a guessed rate.
   */
  const [exchangeRateByAccountId, setExchangeRateByAccountId] = useState<
    Record<string, number>
  >({})
  const [accountSetupState, setAccountSetupState] = useState<
    "ready" | "no_accounts" | "no_detection_accounts" | null
  >(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [retryingAccountId, setRetryingAccountId] = useState<string | null>(
    null,
  )
  const [verifyingAccountId, setVerifyingAccountId] = useState<string | null>(
    null,
  )
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
      const [response, accountSetup, providerEvidence] = await Promise.all([
        sendAutoCheckinMessage(AutoCheckinMessageTypes.GetStatus),
        loadAutoCheckinAccountSetup(),
        loginProviderEvidence.readAll(),
      ])
      // Read through the account, so an observation a later site-type edit
      // retired is not named on a result row.
      const siteTypeMismatches = await siteTypeObservations.readForAccounts(
        accountSetup.accounts.map((account) => ({
          id: account.id,
          siteType: account.site_type,
        })),
      )

      let displayStatus = response.success ? response.data : null
      if (import.meta.env.DEV && response.success) {
        const { appendDevCheckInFixtureSnapshots } = await import(
          "~/services/checkin/autoCheckin/devDiscoveryFixtures"
        )
        const snapshots = await appendDevCheckInFixtureSnapshots(
          displayStatus?.accountsSnapshot ?? [],
          accountSetup.accounts,
        )
        if (snapshots.length)
          displayStatus = { ...displayStatus, accountsSnapshot: snapshots }
      }

      if (loadId === latestStatusLoadIdRef.current) {
        setAccountSetupState(accountSetup.state)
        setSiteTypeMismatches(siteTypeMismatches)
        setExchangeRateByAccountId(
          Object.fromEntries(
            accountSetup.accounts.map((account) => [
              account.id,
              account.exchange_rate,
            ]),
          ),
        )

        if (response.success) {
          setStatus(
            displayStatus
              ? {
                  ...displayStatus,
                  accountsSnapshot: refreshAutoCheckinAccountSnapshots(
                    displayStatus.accountsSnapshot ?? [],
                    accountSetup.accounts,
                    providerEvidence,
                    autoCheckinEnabled,
                  ),
                }
              : displayStatus,
          )
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
  }, [autoCheckinEnabled])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  // Dev-only alarm/pretrigger controls moved into the floating dev panel.
  const { section: autoCheckinDevSection, isDebugPending } =
    useAutoCheckinDevSection({
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
        const retryResult = response.result
        if (
          retryResult &&
          (retryResult.status === CHECKIN_RESULT_STATUS.FAILED ||
            retryResult.status === CHECKIN_RESULT_STATUS.UNCERTAIN)
        ) {
          const failureMessage = getAutoCheckinResultMessage(t, retryResult)
          toast.error(
            t("messages.error.retryFailed", { error: failureMessage }),
          )
        } else {
          toast.success(t("messages.success.retryCompleted"))
        }
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
        toast.error(
          response.error?.trim() ||
            t("messages.error.statusVerificationFailed"),
        )
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

  const {
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
  } = useAutoCheckinRecovery({
    resolveAutoCheckinAccount,
    loadStatus,
    failedManualAccountIds,
    externalCheckInAccounts,
    accountInfoById,
  })

  const isInitialLoading = isLoading && status === null

  return {
    currencyType,
    autoCheckinPreferences,
    autoCheckinEnabled,
    status,
    siteTypeMismatches,
    exchangeRateByAccountId,
    accountSetupState,
    isLoading,
    isRunning,
    isManualRefreshing,
    isOpeningFailedManualSignIns,
    isOpeningExternalCheckIns,
    retryingAccountId,
    verifyingAccountId,
    disablingAccountId,
    pendingOpeningSiteAccountIds,
    openingManualAccountId,
    openingExternalCheckInAccountId,
    deletingAccountId,
    deleteDialogAccount,
    setDeleteDialogAccount,
    uiOpenPretriggerDiagnostics,
    setUiOpenPretriggerDiagnostics,
    uiOpenPretriggerCompletion,
    setUiOpenPretriggerCompletion,
    loadStatus,
    isDebugPending,
    handleRunNow,
    showDebugButtons,
    accountResults,
    failedManualAccountIds,
    canOpenExternalCheckIns,
    externalCheckInAccountIds,
    handleRefresh,
    handleOpenAccountManagement,
    handleRetryAccount,
    handleVerifyAccountStatus,
    handleOpenAccountSite,
    handleOpenManualSignIn,
    handleDisableAccount,
    handleDeleteAccount,
    handleOpenFailedManualSignIns,
    handleOpenExternalCheckIns,
    handleOpenAccountExternalCheckIn,
    isInitialLoading,
  }
}
