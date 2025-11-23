import { CalendarCheck2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { AutoCheckinStatus, CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { sendRuntimeMessage } from "~/utils/browserApi"

import AccountSnapshotTable from "./components/AccountSnapshotTable"
import ActionBar from "./components/ActionBar"
import EmptyResults from "./components/EmptyResults"
import FilterBar, {
  FILTER_STATUS,
  type FilterStatus
} from "./components/FilterBar"
import LoadingSkeleton from "./components/LoadingSkeleton"
import ResultsTable from "./components/ResultsTable"
import StatusCard from "./components/StatusCard"

export default function AutoCheckin() {
  const { t } = useTranslation("autoCheckin")
  const [status, setStatus] = useState<AutoCheckinStatus | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(
    FILTER_STATUS.ALL
  )
  const [searchKeyword, setSearchKeyword] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await sendRuntimeMessage({
        action: "autoCheckin:getStatus"
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

  const handleRunNow = async () => {
    try {
      setIsRunning(true)
      toast.loading(t("messages.loading.running"))

      const response = await sendRuntimeMessage({
        action: "autoCheckin:runNow"
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
  }

  const handleRefresh = () => {
    void loadStatus()
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
      return (
        result.accountName.toLowerCase().includes(keyword) ||
        String(result.accountId).toLowerCase().includes(keyword) ||
        (result.message?.toLowerCase() ?? "").includes(keyword)
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
          onRunNow={handleRunNow}
          onRefresh={handleRefresh}
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
        <ResultsTable results={filteredResults} />
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
