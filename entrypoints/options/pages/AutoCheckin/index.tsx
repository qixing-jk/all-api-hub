import { CalendarCheck2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { AutoCheckinPretriggerCompletionDialog } from "~/components/AutoCheckinPretriggerCompletionDialog"
import { Button } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"
import {
  AutoCheckinRunSummary,
  AutoCheckinStatus,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { stripAutoCheckinMessageKeyPrefix } from "~/utils/autoCheckin"
import { onRuntimeMessage, sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { safeRandomUUID } from "~/utils/identifier"
import { createLogger } from "~/utils/logger"
import { navigateWithinOptionsPage, openCheckInPage } from "~/utils/navigation"

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

/**
 * Auto Check-in dashboard page: fetches status, runs jobs, filters/searches results, and shows snapshots.
 */
export default function AutoCheckin(props: {
  routeParams?: Record<string, string>
}) {
  const { t } = useTranslation("autoCheckin")
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
  const [retryingAccountId, setRetryingAccountId] = useState<string | null>(
    null,
  )
  const [openingManualAccountId, setOpeningManualAccountId] = useState<
    string | null
  >(null)

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
      }
    } catch (error) {
      logger.error("Failed to load status", error)
    } finally {
      setIsLoading(false)
    }
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
    try {
      setIsRunning(true)
      toast.loading(t("messages.loading.running"))

      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinRunNow,
      })

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.runCompleted"))
        await loadStatus()
      } else {
        toast.error(t("messages.error.runFailed", { error: response.error }))
      }
    } catch (error: unknown) {
      toast.dismiss()
      toast.error(
        t("messages.error.runFailed", { error: getErrorMessage(error) }),
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

  const handleRefresh = () => {
    void loadStatus()
  }

  const handleRetryAccount = async (accountId: string) => {
    try {
      setRetryingAccountId(accountId)
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinRetryAccount,
        accountId,
      })

      if (response.success) {
        toast.success(t("messages.success.retryCompleted"))
        await loadStatus()
      } else {
        toast.error(
          t("messages.error.retryFailed", { error: response.error ?? "" }),
        )
      }
    } catch (error: unknown) {
      toast.error(
        t("messages.error.retryFailed", { error: getErrorMessage(error) }),
      )
    } finally {
      setRetryingAccountId(null)
    }
  }

  const handleOpenManualSignIn = async (accountId: string) => {
    try {
      setOpeningManualAccountId(accountId)
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.AutoCheckinGetAccountInfo,
        accountId,
      })

      if (!response.success || !response.data) {
        throw new Error(response.error || "Unknown error")
      }

      const displayData = response.data
      await openCheckInPage(displayData)
    } catch (error: unknown) {
      toast.error(
        t("messages.error.openManualFailed", { error: getErrorMessage(error) }),
      )
    } finally {
      setOpeningManualAccountId(null)
    }
  }

  // Filter and search results
  const accountResults = status?.perAccount
    ? Object.values(status.perAccount)
    : []

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
          ? (t(stripAutoCheckinMessageKeyPrefix(result.messageKey), {
              ...(result.messageParams ?? {}),
              defaultValue: result.messageKey,
            }) as string)
          : result.message ?? "")
      return (
        result.accountName.toLowerCase().includes(keyword) ||
        String(result.accountId).toLowerCase().includes(keyword) ||
        displayMessage.toLowerCase().includes(keyword)
      )
    }

    return true
  })

  if (isLoading) {
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
          isDebugTriggering={isDebugTriggering}
          onRunNow={handleRunNow}
          onRefresh={handleRefresh}
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
          openingManualAccountId={openingManualAccountId}
          onRetryAccount={handleRetryAccount}
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
          <pre className="dark:bg-dark-bg-tertiary max-h-96 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:text-gray-200">
            {uiOpenPretriggerDiagnostics.payload
              ? JSON.stringify(uiOpenPretriggerDiagnostics.payload, null, 2)
              : ""}
          </pre>
        </div>
      </Modal>
    </div>
  )
}
