import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Heading3 } from "~/components/ui"
import type { AutoCheckinStatus } from "~/types/autoCheckin"

import ActionBar from "./components/ActionBar"
import EmptyResults from "./components/EmptyResults"
import FilterBar, { type FilterStatus } from "./components/FilterBar"
import LoadingSkeleton from "./components/LoadingSkeleton"
import ResultsTable from "./components/ResultsTable"
import StatusCard from "./components/StatusCard"

export default function AutoCheckin() {
  const { t } = useTranslation("autoCheckin")
  const [status, setStatus] = useState<AutoCheckinStatus | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await browser.runtime.sendMessage({
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

      const response = await browser.runtime.sendMessage({
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
      filterStatus === "success" &&
      result.status !== "success" &&
      result.status !== "already_checked"
    )
      return false
    if (filterStatus === "failed" && result.status !== "failed") return false

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
      <div className="mb-6">
        <Heading3 className="mb-2">{t("execution.title")}</Heading3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("description")}
        </p>
      </div>

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
    </div>
  )
}
