import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Heading3 } from "~/components/ui"
import type {
  ExecutionProgress,
  ExecutionResult
} from "~/types/newApiModelSync"

import ActionBar from "./components/ActionBar"
import EmptyResults from "./components/EmptyResults"
import FilterBar, { type FilterStatus } from "./components/FilterBar"
import LoadingSkeleton from "./components/LoadingSkeleton"
import ProgressCard from "./components/ProgressCard"
import ResultsTable from "./components/ResultsTable"
import StatisticsCard from "./components/StatisticsCard"

export default function NewApiModelSync() {
  const { t } = useTranslation("newApiModelSync")
  const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(
    null
  )
  const [progress, setProgress] = useState<ExecutionProgress | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [runningChannelId, setRunningChannelId] = useState<number | null>(null)

  const loadLastExecution = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await browser.runtime.sendMessage({
        action: "newApiModelSync:getLastExecution"
      })

      if (response.success) {
        setLastExecution(response.data)
      }
    } catch (error) {
      console.error("Failed to load last execution:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadProgress = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        action: "newApiModelSync:getProgress"
      })

      if (response.success) {
        setProgress(response.data)
      }
    } catch (error) {
      console.error("Failed to load progress:", error)
    }
  }, [])

  useEffect(() => {
    void loadLastExecution()
    void loadProgress()

    // Listen for progress updates
    const handleMessage = (message: any) => {
      if (message.type === "NEW_API_MODEL_SYNC_PROGRESS") {
        setProgress(message.payload)

        // If sync completed, reload execution results
        if (!message.payload?.isRunning) {
          void loadLastExecution()
        }
      }
    }

    browser.runtime.onMessage.addListener(handleMessage)
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage)
    }
  }, [loadLastExecution, loadProgress])

  useEffect(() => {
    if (!progress?.isRunning) {
      setRunningChannelId(null)
    }
  }, [progress?.isRunning])

  const handleRunAll = async () => {
    try {
      const response = await browser.runtime.sendMessage({
        action: "newApiModelSync:triggerAll"
      })

      if (response.success) {
        toast.success(
          t("messages.success.syncCompleted", {
            success: response.data.statistics.successCount,
            total: response.data.statistics.total
          })
        )
        setLastExecution(response.data)
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
      }
    } catch (error: any) {
      toast.error(t("messages.error.syncFailed", { error: error.message }))
    }
  }

  const handleRunSelected = async () => {
    if (selectedIds.size === 0) {
      toast.error(t("messages.error.noSelection"))
      return
    }

    try {
      const response = await browser.runtime.sendMessage({
        action: "newApiModelSync:triggerSelected",
        channelIds: Array.from(selectedIds)
      })

      if (response.success) {
        toast.success(
          t("messages.success.syncCompleted", {
            success: response.data.statistics.successCount,
            total: response.data.statistics.total
          })
        )
        setLastExecution(response.data)
        setSelectedIds(new Set())
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
      }
    } catch (error: any) {
      toast.error(t("messages.error.syncFailed", { error: error.message }))
    }
  }

  const handleRetryFailed = async () => {
    try {
      const response = await browser.runtime.sendMessage({
        action: "newApiModelSync:triggerFailedOnly"
      })

      if (response.success) {
        toast.success(
          t("messages.success.syncCompleted", {
            success: response.data.statistics.successCount,
            total: response.data.statistics.total
          })
        )
        setLastExecution(response.data)
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
      }
    } catch (error: any) {
      toast.error(t("messages.error.syncFailed", { error: error.message }))
    }
  }

  const handleRefresh = () => {
    void loadLastExecution()
    void loadProgress()
  }

  const handleRunSingle = async (channelId: number) => {
    setRunningChannelId(channelId)
    try {
      const response = await browser.runtime.sendMessage({
        action: "newApiModelSync:triggerSelected",
        channelIds: [channelId]
      })

      if (response.success) {
        const newItem = response.data.items[0]

        if (newItem) {
          if (newItem.ok) {
            toast.success(
              t("messages.success.syncCompleted", {
                success: 1,
                total: 1
              })
            )
          } else {
            toast.error(
              t("messages.error.syncFailed", {
                error: newItem.message || "Unknown error"
              })
            )
          }

          setLastExecution((prev) => {
            if (!prev) {
              return response.data
            }

            const updatedItems = prev.items.map((item) =>
              item.channelId === channelId ? newItem : item
            )

            const successCount = updatedItems.filter((item) => item.ok).length
            const failureCount = updatedItems.length - successCount

            return {
              ...prev,
              items: updatedItems,
              statistics: {
                ...prev.statistics,
                successCount,
                failureCount
              }
            }
          })
        }
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
      }
    } catch (error: any) {
      toast.error(t("messages.error.syncFailed", { error: error.message }))
    } finally {
      setRunningChannelId(null)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked && filteredItems) {
      setSelectedIds(new Set(filteredItems.map((item) => item.channelId)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectItem = (channelId: number, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(channelId)
    } else {
      newSelected.delete(channelId)
    }
    setSelectedIds(newSelected)
  }

  // Filter and search
  const filteredItems = lastExecution?.items.filter((item) => {
    // Filter by status
    if (filterStatus === "success" && !item.ok) return false
    if (filterStatus === "failed" && item.ok) return false

    // Search by keyword
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      return (
        item.channelName.toLowerCase().includes(keyword) ||
        item.channelId.toString().includes(keyword) ||
        item.message?.toLowerCase().includes(keyword)
      )
    }

    return true
  })

  if (isLoading) {
    return <LoadingSkeleton />
  }

  const hasHistory = !!(lastExecution && lastExecution.items.length > 0)
  const hasResults = !!(filteredItems && filteredItems.length > 0)

  return (
    <div className="p-6">
      <div className="mb-6">
        <Heading3 className="mb-2">{t("execution.title")}</Heading3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("description")}
        </p>
      </div>

      {progress?.isRunning && (
        <div className="mb-6">
          <ProgressCard progress={progress} />
        </div>
      )}

      {lastExecution?.statistics && (
        <div className="mb-6">
          <StatisticsCard statistics={lastExecution.statistics} />
        </div>
      )}

      <div className="mb-6">
        <ActionBar
          isRunning={progress?.isRunning ?? false}
          selectedCount={selectedIds.size}
          failedCount={lastExecution?.statistics.failureCount ?? 0}
          onRunAll={handleRunAll}
          onRunSelected={handleRunSelected}
          onRetryFailed={handleRetryFailed}
          onRefresh={handleRefresh}
        />
      </div>

      {hasHistory && (
        <div className="mb-4">
          <FilterBar
            statistics={lastExecution.statistics}
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
          items={filteredItems || []}
          selectedIds={selectedIds}
          onSelectAll={handleSelectAll}
          onSelectItem={handleSelectItem}
          onRunSingle={handleRunSingle}
          isRunning={progress?.isRunning ?? false}
          runningChannelId={runningChannelId}
        />
      )}
    </div>
  )
}
