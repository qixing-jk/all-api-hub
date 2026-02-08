import { LineChart, RefreshCcw, Scissors, Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { Alert, Button, Card, Input, Label, TagFilter } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useTheme } from "~/contexts/ThemeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { accountStorage } from "~/services/accountStorage"
import { tagStorage } from "~/services/accountTags/tagStorage"
import { listTagsSorted } from "~/services/accountTags/tagStoreUtils"
import {
  computeRetentionCutoffDayKey,
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/services/dailyBalanceHistory/dayKeys"
import { buildAggregatedDailyBalanceSeries } from "~/services/dailyBalanceHistory/selectors"
import { dailyBalanceHistoryStorage } from "~/services/dailyBalanceHistory/storage"
import { clampBalanceHistoryRetentionDays } from "~/services/dailyBalanceHistory/utils"
import type { SiteAccount, TagStore } from "~/types"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import { navigateWithinOptionsPage } from "~/utils/navigation"

import {
  buildBalanceTrendOption,
  buildIncomeOutcomeBarOption,
} from "./echartsOptions"

const logger = createLogger("BalanceHistoryPage")

const QUICK_RANGES = [
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
  { id: "90d", days: 90 },
  { id: "180d", days: 180 },
  { id: "365d", days: 365 },
] as const

/**
 * Clamp a retention-days value coming from user preferences or input.
 */
function clampRetentionDays(value: unknown): number {
  return clampBalanceHistoryRetentionDays(value)
}

/**
 * Balance History options page that visualizes daily balance snapshots.
 */
export default function BalanceHistory() {
  const { t } = useTranslation("balanceHistory")
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const { preferences } = useUserPreferencesContext()

  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [tagStore, setTagStore] = useState<TagStore | null>(null)
  const [store, setStore] = useState<DailyBalanceHistoryStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [nextAccounts, nextStore, nextTagStore] = await Promise.all([
        accountStorage.getAllAccounts(),
        dailyBalanceHistoryStorage.getStore(),
        tagStorage.getTagStore(),
      ])
      setAccounts(nextAccounts)
      setStore(nextStore)
      setTagStore(nextTagStore)
    } catch (error) {
      logger.error("Failed to load data", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRefreshNow = useCallback(async () => {
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.refreshing"))
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.BalanceHistoryRefreshNow,
        ...(selectedAccountIds.length
          ? { accountIds: selectedAccountIds }
          : {}),
      })

      if (!response?.success) {
        throw new Error(response?.error || "Unknown error")
      }

      toast.success(t("messages.success.refreshCompleted"), { id: toastId })
      await loadData()
    } catch (error) {
      toast.error(
        t("messages.error.refreshFailed", { error: getErrorMessage(error) }),
        { id: toastId },
      )
    }
  }, [loadData, selectedAccountIds, t])

  const handlePruneNow = useCallback(async () => {
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.pruning"))
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.BalanceHistoryPrune,
      })

      if (!response?.success) {
        throw new Error(response?.error || "Unknown error")
      }

      toast.success(t("messages.success.pruneCompleted"), { id: toastId })
      await loadData()
    } catch (error) {
      toast.error(
        t("messages.error.pruneFailed", { error: getErrorMessage(error) }),
        { id: toastId },
      )
    }
  }, [loadData, t])

  const openBalanceHistorySettings = useCallback(() => {
    navigateWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`, {
      tab: "balanceHistory",
      anchor: "balance-history",
    })
  }, [])

  const tagOptions = useMemo(() => {
    if (!tagStore) return []
    const tags = listTagsSorted(tagStore)
    const counts = new Map<string, number>()
    for (const account of accounts) {
      for (const id of account.tagIds ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }

    return tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      count: counts.get(tag.id) ?? 0,
      variant: "outline" as const,
    }))
  }, [accounts, tagStore])

  const accountsForSelectedTags = useMemo(() => {
    if (selectedTagIds.length === 0) {
      return accounts
    }

    const selected = new Set(selectedTagIds)
    return accounts.filter((account) =>
      (account.tagIds ?? []).some((id) => selected.has(id)),
    )
  }, [accounts, selectedTagIds])

  const accountOptions = useMemo(() => {
    return accountsForSelectedTags.map((account) => ({
      value: account.id,
      label: `${account.site_name} (${account.account_info.username})`,
      title: `${account.site_name}\n${account.site_url}\n${account.site_type}`,
    }))
  }, [accountsForSelectedTags])

  const effectiveAccountIds = useMemo(() => {
    const available = new Set(
      accountsForSelectedTags.map((account) => account.id),
    )

    if (selectedAccountIds.length === 0) {
      return Array.from(available)
    }

    return selectedAccountIds.filter((id) => available.has(id))
  }, [accountsForSelectedTags, selectedAccountIds])

  const nowUnixSeconds = Math.floor(Date.now() / 1000)
  const maxDayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)
  const retentionDays =
    preferences.balanceHistory?.retentionDays ??
    DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays
  const safeRetentionDays = clampRetentionDays(retentionDays)
  const minDayKey = computeRetentionCutoffDayKey({
    retentionDays: safeRetentionDays,
    nowUnixSeconds,
  })

  const [startDayKey, setStartDayKey] = useState<string>("")
  const [endDayKey, setEndDayKey] = useState<string>("")

  // Initialize the date range once we know the retention window.
  useEffect(() => {
    if (startDayKey || endDayKey) {
      return
    }

    const defaultDays = Math.min(30, safeRetentionDays)
    setEndDayKey(maxDayKey)
    setStartDayKey(subtractDaysFromDayKey(maxDayKey, defaultDays - 1))
  }, [endDayKey, maxDayKey, safeRetentionDays, startDayKey])

  // Clamp the range when retention changes or when the user types an out-of-bounds date.
  useEffect(() => {
    if (!startDayKey || !endDayKey) return

    let nextStart = startDayKey
    let nextEnd = endDayKey

    if (nextStart < minDayKey) nextStart = minDayKey
    if (nextEnd > maxDayKey) nextEnd = maxDayKey
    if (nextStart > nextEnd) nextStart = nextEnd

    if (nextStart !== startDayKey) setStartDayKey(nextStart)
    if (nextEnd !== endDayKey) setEndDayKey(nextEnd)
  }, [endDayKey, maxDayKey, minDayKey, startDayKey])

  const series = useMemo(() => {
    const effectiveStartDayKey = startDayKey || minDayKey
    const effectiveEndDayKey = endDayKey || maxDayKey
    return buildAggregatedDailyBalanceSeries({
      store,
      accountIds: effectiveAccountIds,
      startDayKey: effectiveStartDayKey,
      endDayKey: effectiveEndDayKey,
    })
  }, [effectiveAccountIds, endDayKey, maxDayKey, minDayKey, startDayKey, store])

  const balanceOption = useMemo(() => {
    return buildBalanceTrendOption({
      dayKeys: series.dayKeys,
      values: series.quotaTotals,
      seriesLabel: t("charts.balance.series"),
      yAxisLabel: t("charts.balance.yAxis"),
      isDark,
    })
  }, [isDark, series.dayKeys, series.quotaTotals, t])

  const cashflowOption = useMemo(() => {
    return buildIncomeOutcomeBarOption({
      dayKeys: series.dayKeys,
      incomeValues: series.incomeTotals,
      outcomeValues: series.outcomeTotals,
      incomeLabel: t("charts.cashflow.income"),
      outcomeLabel: t("charts.cashflow.outcome"),
      yAxisLabel: t("charts.cashflow.yAxis"),
      isDark,
    })
  }, [isDark, series.dayKeys, series.incomeTotals, series.outcomeTotals, t])

  const enabled = preferences.balanceHistory?.enabled ?? false
  const endOfDayCaptureEnabled =
    preferences.balanceHistory?.endOfDayCapture?.enabled ?? false

  const shouldShowCashflowWarning =
    enabled &&
    (preferences.showTodayCashflow ?? true) === false &&
    !endOfDayCaptureEnabled

  const isStoreEmpty = (
    store?.snapshotsByAccountId
      ? Object.keys(store.snapshotsByAccountId).length === 0
      : true
  ) as boolean

  const snapshotCompleteDays = useMemo(() => {
    const totals = series.coverage.reduce(
      (acc, item) => {
        if (item.snapshotAccounts === item.totalAccounts)
          acc.snapshotComplete += 1
        if (item.cashflowAccounts === item.totalAccounts)
          acc.cashflowComplete += 1
        return acc
      },
      { snapshotComplete: 0, cashflowComplete: 0 },
    )
    return totals
  }, [series.coverage])

  const snapshotAvailableDays = useMemo(() => {
    return series.coverage.reduce(
      (acc, item) => acc + (item.snapshotAccounts > 0 ? 1 : 0),
      0,
    )
  }, [series.coverage])

  const cashflowAvailableDays = useMemo(() => {
    return series.coverage.reduce(
      (acc, item) => acc + (item.cashflowAccounts > 0 ? 1 : 0),
      0,
    )
  }, [series.coverage])

  const bestCoveredAccountId = useMemo(() => {
    const effectiveStartDayKey = startDayKey || minDayKey
    const effectiveEndDayKey = endDayKey || maxDayKey

    if (!store) return null
    if (!effectiveStartDayKey || !effectiveEndDayKey) return null

    let bestId: string | null = null
    let bestCount = 0

    for (const account of accountsForSelectedTags) {
      const perDay = store.snapshotsByAccountId[account.id]
      if (!perDay) continue

      let count = 0
      for (const dayKey of Object.keys(perDay)) {
        if (dayKey < effectiveStartDayKey || dayKey > effectiveEndDayKey)
          continue
        count += 1
      }

      if (count > bestCount) {
        bestCount = count
        bestId = account.id
      }
    }

    return bestId
  }, [
    accountsForSelectedTags,
    endDayKey,
    maxDayKey,
    minDayKey,
    startDayKey,
    store,
  ])

  const shouldShowIncompleteSelectionHint =
    !isLoading &&
    !isStoreEmpty &&
    effectiveAccountIds.length > 1 &&
    snapshotAvailableDays > 0 &&
    snapshotCompleteDays.snapshotComplete === 0

  // When balance history capture is disabled and no snapshots exist yet,
  // show a clear CTA instead of rendering filters + an empty state.
  const shouldShowEnableBalanceHistoryHint = !enabled && !isLoading

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={LineChart}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleRefreshNow()}
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {t("actions.refreshNow")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePruneNow()}
              leftIcon={<Scissors className="h-4 w-4" />}
            >
              {t("actions.prune")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openBalanceHistorySettings}
              leftIcon={<Settings className="h-4 w-4" />}
            >
              {t("common:labels.settings")}
            </Button>
          </div>
        }
      />

      {shouldShowCashflowWarning && (
        <Alert
          variant="warning"
          title={t("warnings.cashflowDisabled.title")}
          description={t("warnings.cashflowDisabled.description")}
        />
      )}

      {shouldShowIncompleteSelectionHint && (
        <Alert
          variant="info"
          title={t("hints.incompleteSelection.title")}
          description={t("hints.incompleteSelection.description")}
        >
          {bestCoveredAccountId && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedAccountIds([bestCoveredAccountId])}
              >
                {t("hints.incompleteSelection.actions.viewBestAccount")}
              </Button>
            </div>
          )}
        </Alert>
      )}

      {shouldShowEnableBalanceHistoryHint ? (
        <Alert
          variant="info"
          title={t("hints.disabled.title")}
          description={t("hints.disabled.description")}
        >
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={openBalanceHistorySettings}
              leftIcon={<Settings className="h-4 w-4" />}
            >
              {t("hints.disabled.actions.openSettings")}
            </Button>
          </div>
        </Alert>
      ) : (
        <>
          <Card padding="md">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">
                  {t("filters.tags")}
                </Label>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("filters.tagsHint")}
                </div>
              </div>
              <TagFilter
                options={tagOptions}
                value={selectedTagIds}
                onChange={setSelectedTagIds}
                includeAllOption
                allLabel={t("filters.allTags")}
                maxVisibleLines={2}
                disabled={tagOptions.length === 0}
              />

              <div>
                <Label className="text-sm font-medium">
                  {t("filters.accounts")}
                </Label>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("filters.accountsHint")}
                </div>
              </div>
              <TagFilter
                options={accountOptions}
                value={selectedAccountIds}
                onChange={setSelectedAccountIds}
                includeAllOption
                allLabel={t("filters.allAccounts")}
                maxVisibleLines={3}
                disabled={accountOptions.length === 0}
              />

              <div>
                <Label className="text-sm font-medium">
                  {t("filters.range")}
                </Label>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("filters.rangeHint", { days: safeRetentionDays })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {QUICK_RANGES.map((preset) => {
                  const label = t(`filters.quickRanges.${preset.id}`)
                  return (
                    <Button
                      key={preset.id}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const desired = Math.min(preset.days, safeRetentionDays)
                        setEndDayKey(maxDayKey)
                        setStartDayKey(
                          subtractDaysFromDayKey(maxDayKey, desired - 1),
                        )
                      }}
                    >
                      {label}
                    </Button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t("filters.startDay")}
                  </Label>
                  <Input
                    type="date"
                    value={startDayKey}
                    min={minDayKey || undefined}
                    max={maxDayKey || undefined}
                    aria-label={t("filters.startDay")}
                    onChange={(event) => setStartDayKey(event.target.value)}
                    disabled={!minDayKey}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t("filters.endDay")}
                  </Label>
                  <Input
                    type="date"
                    value={endDayKey}
                    min={minDayKey || undefined}
                    max={maxDayKey || undefined}
                    aria-label={t("filters.endDay")}
                    onChange={(event) => setEndDayKey(event.target.value)}
                    disabled={!maxDayKey}
                  />
                </div>
              </div>

              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("summary.coverage", {
                  snapshotAvailableDays,
                  snapshotCompleteDays: snapshotCompleteDays.snapshotComplete,
                  cashflowAvailableDays,
                  cashflowCompleteDays: snapshotCompleteDays.cashflowComplete,
                  totalDays: series.dayKeys.length,
                })}
              </div>
            </div>
          </Card>

          {isLoading ? (
            <div className="dark:text-dark-text-secondary text-sm text-gray-600">
              {t("messages.loading.loadingData")}
            </div>
          ) : isStoreEmpty ? (
            <Card padding="md">
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("empty.title")}</div>
                <div className="dark:text-dark-text-tertiary text-sm text-gray-600">
                  {t("empty.description")}
                </div>
              </div>
            </Card>
          ) : snapshotAvailableDays === 0 ? (
            <Card padding="md">
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {t("emptyRange.title")}
                </div>
                <div className="dark:text-dark-text-tertiary text-sm text-gray-600">
                  {t("emptyRange.description")}
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card padding="md">
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("charts.balance.title")}
                  </div>
                  <div className="h-80 w-full">
                    <EChart option={balanceOption} />
                  </div>
                </div>
              </Card>

              <Card padding="md">
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("charts.cashflow.title")}
                  </div>
                  <div className="h-80 w-full">
                    <EChart option={cashflowOption} />
                  </div>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
