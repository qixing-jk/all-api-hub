import { Tab } from "@headlessui/react"
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { RefreshCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Button, EmptyState, Input } from "~/components/ui"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import type { ManagedSiteChannel } from "~/types/managedSite"
import type {
  ExecutionItemResult,
  ExecutionProgress,
  ExecutionResult,
} from "~/types/managedSiteModelSync"
import { sendRuntimeMessage } from "~/utils/browserApi"

import ActionBar from "./components/ActionBar"
import EmptyResults from "./components/EmptyResults"
import FilterBar, { type FilterStatus } from "./components/FilterBar"
import LoadingSkeleton from "./components/LoadingSkeleton"
import ProgressCard from "./components/ProgressCard"
import ResultsTable from "./components/ResultsTable"
import StatisticsCard from "./components/StatisticsCard"

const TAB_INDEX = {
  history: 0,
  manual: 1,
} as const

/**
 * New API Model Sync dashboard showing history, manual runs, progress, and filters.
 * Fetches execution data, channels, and renders tabs for history and manual sync.
 * @returns Page layout with controls, status, and result tables.
 */
export default function ManagedSiteModelSync() {
  const { t } = useTranslation("managedSiteModelSync")
  const hasInitializedTab = useRef(false)
  const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(
    null,
  )
  const [progress, setProgress] = useState<ExecutionProgress | null>(null)
  const [nextScheduledAt, setNextScheduledAt] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<number>>(
    new Set(),
  )
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<number>>(
    new Set(),
  )
  const [isLoading, setIsLoading] = useState(true)
  const [runningChannelId, setRunningChannelId] = useState<number | null>(null)
  const [selectedTab, setSelectedTab] = useState<number>(TAB_INDEX.history)
  const [channels, setChannels] = useState<ManagedSiteChannel[]>([])
  const [isChannelsLoading, setIsChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [manualSearchKeyword, setManualSearchKeyword] = useState("")
  const [hasAttemptedChannelsLoad, setHasAttemptedChannelsLoad] =
    useState(false)

  const loadLastExecution = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await sendRuntimeMessage({
        action: "modelSync:getLastExecution",
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
      const response = await sendRuntimeMessage({
        action: "modelSync:getProgress",
      })

      if (response.success) {
        setProgress(response.data)
      }
    } catch (error) {
      console.error("Failed to load progress:", error)
    }
  }, [])

  const loadNextRun = useCallback(async () => {
    try {
      const response = await sendRuntimeMessage({
        action: "modelSync:getNextRun",
      })

      if (response.success) {
        setNextScheduledAt(response.data?.nextScheduledAt ?? null)
      }
    } catch (error) {
      console.error("Failed to load next run:", error)
    }
  }, [])

  const loadChannels = useCallback(async () => {
    try {
      setIsChannelsLoading(true)
      setChannelsError(null)
      const response = await sendRuntimeMessage({
        action: "modelSync:listChannels",
      })

      if (response.success) {
        setChannels(response.data?.items ?? [])
      } else {
        throw new Error(response.error)
      }
    } catch (error: any) {
      const message = error?.message || "Unknown error"
      setChannelsError(message)
      toast.error(
        t("messages.error.loadFailed", {
          error: message,
        }),
      )
    } finally {
      setIsChannelsLoading(false)
      setHasAttemptedChannelsLoad(true)
    }
  }, [t])

  useEffect(() => {
    void loadLastExecution()
    void loadProgress()
    void loadNextRun()

    // Listen for progress updates
    const handleMessage = (message: any) => {
      if (message.type === "MANAGED_SITE_MODEL_SYNC_PROGRESS") {
        setProgress(message.payload)

        // If sync completed, reload execution results
        if (!message.payload?.isRunning) {
          void loadLastExecution()
          void loadNextRun()
        }
      }
    }

    browser.runtime.onMessage.addListener(handleMessage)
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage)
    }
  }, [loadLastExecution, loadNextRun, loadProgress])

  useEffect(() => {
    if (!progress?.isRunning) {
      setRunningChannelId(null)
    }
  }, [progress?.isRunning])

  useEffect(() => {
    if (isLoading || hasInitializedTab.current) {
      return
    }

    hasInitializedTab.current = true
    setSelectedTab(
      lastExecution?.items?.length ? TAB_INDEX.history : TAB_INDEX.manual,
    )
  }, [isLoading, lastExecution?.items?.length])

  useEffect(() => {
    if (
      selectedTab === TAB_INDEX.manual &&
      channels.length === 0 &&
      !isChannelsLoading &&
      !hasAttemptedChannelsLoad
    ) {
      void loadChannels()
    }
  }, [
    channels.length,
    hasAttemptedChannelsLoad,
    isChannelsLoading,
    loadChannels,
    selectedTab,
  ])

  const handleRunAll = async () => {
    try {
      const response = await sendRuntimeMessage({
        action: "modelSync:triggerAll",
      })

      if (response.success) {
        toast.success(
          t("messages.success.syncCompleted", {
            success: response.data.statistics.successCount,
            total: response.data.statistics.total,
          }),
        )
        setLastExecution(response.data)
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
      }
    } catch (error: any) {
      toast.error(t("messages.error.syncFailed", { error: error.message }))
    }
  }

  const handleRunSelected = async (source: "history" | "manual") => {
    const selectedSet =
      source === "history" ? historySelectedIds : manualSelectedIds

    if (selectedSet.size === 0) {
      toast.error(t("messages.error.noSelection"))
      return
    }

    try {
      const response = await sendRuntimeMessage({
        action: "modelSync:triggerSelected",
        channelIds: Array.from(selectedSet),
      })

      if (response.success) {
        toast.success(
          t("messages.success.syncCompleted", {
            success: response.data.statistics.successCount,
            total: response.data.statistics.total,
          }),
        )
        setLastExecution(response.data)
        if (source === "history") {
          setHistorySelectedIds(new Set())
        } else {
          setManualSelectedIds(new Set())
        }
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
      }
    } catch (error: any) {
      toast.error(t("messages.error.syncFailed", { error: error.message }))
    }
  }

  const handleRetryFailed = async () => {
    try {
      const response = await sendRuntimeMessage({
        action: "modelSync:triggerFailedOnly",
      })

      if (response.success) {
        toast.success(
          t("messages.success.syncCompleted", {
            success: response.data.statistics.successCount,
            total: response.data.statistics.total,
          }),
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
    void loadNextRun()
  }

  const handleRunSingle = async (channelId: number) => {
    setRunningChannelId(channelId)
    try {
      const response = await sendRuntimeMessage({
        action: "modelSync:triggerSelected",
        channelIds: [channelId],
      })

      if (response.success) {
        const newItem = response.data.items[0]

        if (newItem) {
          if (newItem.ok) {
            toast.success(
              t("messages.success.syncCompleted", {
                success: 1,
                total: 1,
              }),
            )
          } else {
            toast.error(
              t("messages.error.syncFailed", {
                error: newItem.message || "Unknown error",
              }),
            )
          }

          setLastExecution((prev) => {
            if (!prev) {
              return response.data
            }

            const updatedItems = prev.items.map((item) =>
              item.channelId === channelId ? newItem : item,
            )

            const successCount = updatedItems.filter((item) => item.ok).length
            const failureCount = updatedItems.length - successCount

            return {
              ...prev,
              items: updatedItems,
              statistics: {
                ...prev.statistics,
                successCount,
                failureCount,
              },
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

  const handleHistorySelectAll = (checked: boolean) => {
    if (checked && filteredItems) {
      setHistorySelectedIds(
        new Set(filteredItems.map((item) => item.channelId)),
      )
    } else {
      setHistorySelectedIds(new Set())
    }
  }

  const handleHistorySelectItem = (channelId: number, checked: boolean) => {
    const newSelected = new Set(historySelectedIds)
    if (checked) {
      newSelected.add(channelId)
    } else {
      newSelected.delete(channelId)
    }
    setHistorySelectedIds(newSelected)
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

  const manualItems: ExecutionItemResult[] = useMemo(() => {
    const keyword = manualSearchKeyword.toLowerCase().trim()
    const source = keyword
      ? channels.filter(
          (channel) =>
            channel.name.toLowerCase().includes(keyword) ||
            channel.id.toString().includes(keyword),
        )
      : channels

    return source.map((channel) => ({
      channelId: channel.id,
      channelName: channel.name,
      ok: true,
      attempts: 0,
      finishedAt: 0,
    }))
  }, [channels, manualSearchKeyword])

  if (isLoading) {
    return <LoadingSkeleton />
  }

  const hasHistory = !!(lastExecution && lastExecution.items.length > 0)
  const hasResults = !!(filteredItems && filteredItems.length > 0)
  const manualHasResults = manualItems.length > 0

  const handleManualSelectAll = (checked: boolean) => {
    if (checked) {
      setManualSelectedIds(new Set(manualItems.map((item) => item.channelId)))
    } else {
      setManualSelectedIds(new Set())
    }
  }

  const handleManualSelectItem = (channelId: number, checked: boolean) => {
    const newSelected = new Set(manualSelectedIds)
    if (checked) {
      newSelected.add(channelId)
    } else {
      newSelected.delete(channelId)
    }
    setManualSelectedIds(newSelected)
  }

  const renderTabs = () => (
    <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
      <Tab.List className="mb-4 flex space-x-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {["history", "manual"].map((key) => (
          <Tab
            key={key}
            className={({ selected }) =>
              `flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selected
                  ? "bg-white text-blue-700 shadow dark:bg-gray-900 dark:text-blue-400"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
              }`
            }
          >
            {t(`execution.tabs.${key as "history" | "manual"}`)}
          </Tab>
        ))}
      </Tab.List>
      <Tab.Panels>
        <Tab.Panel>
          <div className="space-y-4">
            <ActionBar
              isRunning={progress?.isRunning ?? false}
              selectedCount={historySelectedIds.size}
              failedCount={lastExecution?.statistics.failureCount ?? 0}
              onRunAll={handleRunAll}
              onRunSelected={() => handleRunSelected("history")}
              onRetryFailed={handleRetryFailed}
              onRefresh={handleRefresh}
            />

            {hasHistory && (
              <div className="mt-2">
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
                selectedIds={historySelectedIds}
                onSelectAll={handleHistorySelectAll}
                onSelectItem={handleHistorySelectItem}
                onRunSingle={handleRunSingle}
                isRunning={progress?.isRunning ?? false}
                runningChannelId={runningChannelId}
              />
            )}
          </div>
        </Tab.Panel>
        <Tab.Panel>
          <div className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("execution.manual.description")}
              </p>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="md:w-64">
                  <Input
                    type="text"
                    placeholder={
                      t("execution.manual.searchPlaceholder") as string
                    }
                    value={manualSearchKeyword}
                    onChange={(e) => setManualSearchKeyword(e.target.value)}
                    leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
                  />
                </div>
                <Button
                  onClick={() => handleRunSelected("manual")}
                  variant="secondary"
                  disabled={
                    (progress?.isRunning ?? false) ||
                    manualSelectedIds.size === 0
                  }
                >
                  {t("execution.actions.runSelected")} ({manualSelectedIds.size}
                  )
                </Button>
                <Button
                  onClick={() => void loadChannels()}
                  variant="ghost"
                  disabled={isChannelsLoading}
                  leftIcon={<RefreshCcw className="h-4 w-4" />}
                >
                  {t("execution.actions.refresh")}
                </Button>
              </div>
            </div>

            {isChannelsLoading ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {t("execution.manual.loading")}
              </div>
            ) : manualHasResults ? (
              <ResultsTable
                items={manualItems}
                selectedIds={manualSelectedIds}
                onSelectAll={handleManualSelectAll}
                onSelectItem={handleManualSelectItem}
                onRunSingle={handleRunSingle}
                isRunning={progress?.isRunning ?? false}
                runningChannelId={runningChannelId}
                visibleColumns={{
                  status: false,
                  message: false,
                  attempts: false,
                  finishedAt: false,
                }}
              />
            ) : (
              <EmptyState
                title={t("execution.manual.empty.title")}
                description={
                  channelsError
                    ? channelsError
                    : (t("execution.manual.empty.description") as string)
                }
                icon={<MagnifyingGlassIcon className="h-12 w-12" />}
                action={{
                  label: t("execution.manual.reload"),
                  onClick: () => void loadChannels(),
                }}
              />
            )}
          </div>
        </Tab.Panel>
      </Tab.Panels>
    </Tab.Group>
  )

  return (
    <div className="p-6">
      <PageHeader
        icon={RefreshCcw}
        title={t("execution.title")}
        description={t("description")}
        spacing="compact"
      />

      {progress?.isRunning && (
        <div className="mb-6">
          <ProgressCard progress={progress} />
        </div>
      )}

      {lastExecution?.statistics && (
        <div className="mb-6">
          <StatisticsCard
            statistics={lastExecution.statistics}
            nextScheduledAt={nextScheduledAt}
          />
        </div>
      )}

      {renderTabs()}
    </div>
  )
}
