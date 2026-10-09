import { RefreshCcw, Search } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  EmptyState,
  Input,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui"
import { CORNERS } from "~/constants/designTokens"
import ActionBar from "~/features/ManagedSiteModelSync/commands/ActionBar"
import { MANAGED_SITE_MODEL_SYNC_ACTIONS } from "~/features/ManagedSiteModelSync/commands/actionState"
import { MODEL_SYNC_EXCLUSIONS_TARGET_ID } from "~/features/ManagedSiteModelSync/exclusions/targetIds"
import EmptyResults from "~/features/ManagedSiteModelSync/results/EmptyResults"
import FilterBar from "~/features/ManagedSiteModelSync/results/FilterBar"
import ResultsTable from "~/features/ManagedSiteModelSync/results/ResultsTable"
import {
  getTabValueFromIndex,
  TAB_INDEX,
  TAB_VALUE,
} from "~/features/ManagedSiteModelSync/workspace/modelSyncWorkspace"
import type { useManagedSiteModelSyncViewModel } from "~/features/ManagedSiteModelSync/workspace/useManagedSiteModelSyncViewModel"

/** Render the two workspaces using the same target-scoped selection and command model. */
export function ManagedSiteModelSyncTabs({
  model,
}: {
  model: ReturnType<typeof useManagedSiteModelSyncViewModel>
}) {
  const { t } = useTranslation([
    "managedSiteModelSync",
    "settings",
    "messages",
    "common",
  ])
  const {
    exclusions,
    manualExcludedOnly,
    setManualExcludedOnly,
    manualExcludedCount,
    selectedTab,
    handleTabChange,
    historyTabLabel,
    manualTabLabel,
    routeResourceUnavailable,
    isAnySyncPending,
    isLoading,
    isManualRefreshPending,
    activeAction,
    historySelectedKeys,
    retryableFailedRefs,
    handleRunAll,
    handleRunSelected,
    handleRetryFailed,
    handleRefresh,
    hasHistory,
    lastExecution,
    filterStatus,
    searchKeyword,
    handleHistoryStatusChange,
    handleHistorySearchChange,
    hasResults,
    filteredItems,
    handleHistorySelectAll,
    handleHistorySelectItem,
    handleRunSingle,
    runningResourceKey,
    canUseResource,
    manualSearchKeyword,
    handleManualSearchChange,
    isManualChannelRefresh,
    manualSelectedKeys,
    handleManualChannelRefresh,
    isChannelsLoading,
    manualHasResults,
    manualItems,
    handleManualSelectAll,
    handleManualSelectItem,
    channelsError,
    loadChannels,
  } = model
  return (
    <Tabs
      value={getTabValueFromIndex(selectedTab)}
      onValueChange={(value) => {
        handleTabChange(
          value === TAB_VALUE.manual ? TAB_INDEX.manual : TAB_INDEX.history,
        )
      }}
    >
      <TabsList
        className={`corners-concentric bg-muted dark:bg-card mb-density-4 py-density-1 flex space-x-2 rounded-lg px-1 [--corner-inset:--spacing(1)] ${CORNERS.buttonItems}`}
      >
        <TabsTrigger
          value={TAB_VALUE.history}
          className="text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-theme-700 dark:text-secondary-foreground dark:data-[state=active]:bg-background dark:data-[state=active]:text-theme-400 py-density-2 flex-1 rounded-lg px-4 text-sm font-medium transition-colors data-[state=active]:shadow"
        >
          {historyTabLabel}
        </TabsTrigger>
        <TabsTrigger
          value={TAB_VALUE.manual}
          className="text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-theme-700 dark:text-secondary-foreground dark:data-[state=active]:bg-background dark:data-[state=active]:text-theme-400 py-density-2 flex-1 rounded-lg px-4 text-sm font-medium transition-colors data-[state=active]:shadow"
        >
          {manualTabLabel}
        </TabsTrigger>
      </TabsList>
      {routeResourceUnavailable && (
        <Alert variant="warning" role="status" className="mb-density-4">
          {t("execution.table.resourceUnavailable")}
        </Alert>
      )}
      <p
        id={MODEL_SYNC_EXCLUSIONS_TARGET_ID}
        className="text-muted-foreground mb-density-4 text-sm"
      >
        {t("execution.exclusions.description")}
      </p>
      {exclusions.error && (
        <Alert variant="warning" role="alert" className="mb-density-4">
          {exclusions.error}
          <Button variant="ghost" onClick={() => void exclusions.reload()}>
            {t("common:actions.retry")}
          </Button>
        </Alert>
      )}
      <TabsContent value={TAB_VALUE.history}>
        <div className="space-y-density-4">
          <ActionBar
            isRunning={isAnySyncPending || isLoading || isManualRefreshPending}
            activeAction={activeAction}
            isRefreshing={isManualRefreshPending}
            selectedCount={historySelectedKeys.size}
            failedCount={retryableFailedRefs.length}
            onRunAll={handleRunAll}
            onRunSelected={() => handleRunSelected("history")}
            onRetryFailed={() => void handleRetryFailed(retryableFailedRefs)}
            onRefresh={handleRefresh}
          />

          {hasHistory && lastExecution && (
            <div className="mt-density-2">
              <FilterBar
                statistics={lastExecution.statistics}
                status={filterStatus}
                keyword={searchKeyword}
                onStatusChange={handleHistoryStatusChange}
                onKeywordChange={handleHistorySearchChange}
              />
            </div>
          )}

          {!hasResults ? (
            <EmptyResults hasHistory={hasHistory} />
          ) : (
            <ResultsTable
              items={filteredItems || []}
              selectedKeys={historySelectedKeys}
              onSelectAll={handleHistorySelectAll}
              onSelectItem={handleHistorySelectItem}
              onRunSingle={handleRunSingle}
              isRunning={isAnySyncPending}
              runningResourceKey={runningResourceKey}
              canUseResource={canUseResource}
              exclusions={exclusions}
            />
          )}
        </div>
      </TabsContent>
      <TabsContent value={TAB_VALUE.manual}>
        <div className="space-y-density-4">
          <Button
            variant={manualExcludedOnly ? "secondary" : "ghost"}
            aria-pressed={manualExcludedOnly}
            disabled={
              exclusions.isLoading ||
              Boolean(exclusions.error) ||
              isChannelsLoading
            }
            onClick={() => setManualExcludedOnly(!manualExcludedOnly)}
          >
            {t("execution.exclusions.showOnly")} ({manualExcludedCount})
          </Button>
          <div className="gap-y-density-4 flex flex-col gap-x-4 md:flex-row md:items-center md:justify-between">
            <p className="text-muted-foreground text-sm">
              {t("execution.manual.description")}
            </p>
            <div className="gap-y-density-3 flex flex-col gap-x-3 md:flex-row md:items-center">
              <div className="md:w-64">
                <Input
                  type="text"
                  placeholder={
                    t("execution.manual.searchPlaceholder") as string
                  }
                  value={manualSearchKeyword}
                  onChange={(e) => handleManualSearchChange(e.target.value)}
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </div>
              <Button
                onClick={() => handleRunSelected("manual")}
                variant="secondary"
                disabled={
                  isAnySyncPending ||
                  isManualChannelRefresh ||
                  manualSelectedKeys.size === 0
                }
                loading={
                  activeAction ===
                  MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_SELECTED_MANUAL
                }
              >
                {activeAction ===
                MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_SELECTED_MANUAL
                  ? t("execution.actions.runningSelected")
                  : `${t("execution.actions.runSelected")} (${manualSelectedKeys.size})`}
              </Button>
              <Button
                onClick={() => void handleManualChannelRefresh()}
                variant="ghost"
                disabled={isChannelsLoading || isAnySyncPending}
                loading={isManualChannelRefresh}
                leftIcon={<RefreshCcw className="h-4 w-4" />}
              >
                {isManualChannelRefresh
                  ? t("common:status.refreshing")
                  : t("execution.actions.refresh")}
              </Button>
            </div>
          </div>

          {isChannelsLoading ? (
            <div
              role="status"
              className="border-border-strong text-muted-foreground dark:border-border py-density-6 gap-y-density-3 flex flex-col items-center rounded-lg border border-dashed px-6 text-center text-sm"
            >
              <Spinner size="lg" variant="gray" aria-hidden="true" />
              {t("execution.manual.loading")}
            </div>
          ) : manualHasResults ? (
            <ResultsTable
              items={manualItems}
              selectedKeys={manualSelectedKeys}
              onSelectAll={handleManualSelectAll}
              onSelectItem={handleManualSelectItem}
              onRunSingle={handleRunSingle}
              isRunning={isAnySyncPending}
              runningResourceKey={runningResourceKey}
              canUseResource={canUseResource}
              exclusions={exclusions}
              visibleColumns={{
                status: false,
                message: false,
                attempts: false,
                finishedAt: false,
              }}
            />
          ) : (
            <EmptyState
              title={t(
                manualExcludedOnly && !channelsError
                  ? "execution.empty.noResults"
                  : "execution.manual.empty.title",
              )}
              description={
                channelsError
                  ? channelsError
                  : t(
                      manualExcludedOnly
                        ? "execution.empty.noResultsDesc"
                        : "execution.manual.empty.description",
                    )
              }
              icon={<Search className="h-12 w-12" />}
              action={{
                label: t("execution.manual.reload"),
                onClick: () => void loadChannels(),
              }}
            />
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
