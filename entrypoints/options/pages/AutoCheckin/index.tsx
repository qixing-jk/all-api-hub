import { CalendarCheck2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { AutoCheckinStatus, CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { sendRuntimeMessage } from "~/utils/browserApi"
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
 * Auto Check-in dashboard page: fetches status, runs jobs, filters/searches results, and shows snapshots.
 */
export default function AutoCheckin(props: {
  routeParams?: Record<string, string>
}) {
  const { t } = useTranslation("autoCheckin")
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

  const quickRunTriggeredRef = useRef(false)

  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await sendRuntimeMessage({
        action: "autoCheckin:getStatus",
      })

      if (response.success) {
        setStatus(response.data)
      }
    } catch (error) {
      console.error("Failed to load status:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleRunNow = useCallback(async () => {
    try {
      setIsRunning(true)
      toast.loading(t("messages.loading.running"))

      const response = await sendRuntimeMessage({
        action: "autoCheckin:runNow",
      })

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.runCompleted"))
        await loadStatus()
      } else {
        toast.error(t("messages.error.runFailed", { error: response.error }))
      }
    } catch (error: any) {
      toast.dismiss()
      toast.error(t("messages.error.runFailed", { error: error.message }))
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
        action: "autoCheckin:debugTriggerDailyAlarmNow",
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
    } catch (error: any) {
      toast.dismiss()
      toast.error(
        t("messages.error.dailyAlarmTriggerFailed", { error: error.message }),
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
        action: "autoCheckin:debugTriggerRetryAlarmNow",
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
    } catch (error: any) {
      toast.dismiss()
      toast.error(
        t("messages.error.retryAlarmTriggerFailed", { error: error.message }),
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
        action: "autoCheckin:retryAccount",
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
    } catch (error: any) {
      toast.error(t("messages.error.retryFailed", { error: error.message }))
    } finally {
      setRetryingAccountId(null)
    }
  }

  const handleOpenManualSignIn = async (accountId: string) => {
    try {
      setOpeningManualAccountId(accountId)
      const response = await sendRuntimeMessage({
        action: "autoCheckin:getAccountInfo",
        accountId,
      })

      if (!response.success || !response.data) {
        throw new Error(response.error || "Unknown error")
      }

      const displayData = response.data
      await openCheckInPage(displayData)
    } catch (error: any) {
      toast.error(
        t("messages.error.openManualFailed", { error: error.message }),
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
          ? (t(result.messageKey.replace(/^autoCheckin:/, ""), {
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
          <StatusCard status={status} />
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
    </div>
  )
}
