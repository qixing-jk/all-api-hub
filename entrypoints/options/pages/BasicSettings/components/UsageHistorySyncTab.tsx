import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardContent, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { accountStorage } from "~/services/accountStorage"
import { usageHistoryStorage } from "~/services/usageHistory/storage"
import type { SiteAccount } from "~/types"
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"
import type { UsageHistoryStore } from "~/types/usageHistory"
import { hasAlarmsAPI, sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

import UsageHistorySyncSettingsSection from "./UsageHistorySyncSettingsSection"
import UsageHistorySyncStateTable, {
  type UsageHistoryAccountRow,
} from "./UsageHistorySyncStateTable"

/**
 * Basic Settings tab for usage-history synchronization: sync settings + per-account sync state.
 */
export default function UsageHistorySyncTab() {
  const { t } = useTranslation("usageAnalytics")
  const { preferences, loadPreferences } = useUserPreferencesContext()

  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [store, setStore] = useState<UsageHistoryStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [syncingAccountIds, setSyncingAccountIds] = useState<Set<string>>(
    () => new Set(),
  )

  const [accountSearch, setAccountSearch] = useState("")

  const [enabled, setEnabled] = useState<boolean>(
    preferences.usageHistory?.enabled ?? false,
  )
  const [retentionDays, setRetentionDays] = useState<number>(
    preferences.usageHistory?.retentionDays ?? 30,
  )
  const [scheduleMode, setScheduleMode] = useState<string>(
    preferences.usageHistory?.scheduleMode ??
      USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
  )
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState<number>(
    preferences.usageHistory?.syncIntervalMinutes ?? 6 * 60,
  )

  useEffect(() => {
    setEnabled(preferences.usageHistory?.enabled ?? false)
    setRetentionDays(preferences.usageHistory?.retentionDays ?? 30)
    setScheduleMode(
      preferences.usageHistory?.scheduleMode ??
        USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
    )
    setSyncIntervalMinutes(
      preferences.usageHistory?.syncIntervalMinutes ?? 6 * 60,
    )
  }, [preferences.usageHistory])

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [nextAccounts, nextStore] = await Promise.all([
        accountStorage.getAllAccounts(),
        usageHistoryStorage.getStore(),
      ])
      setAccounts(nextAccounts)
      setStore(nextStore)
    } catch (error) {
      console.error("[UsageHistorySyncTab] Failed to load data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase()
    if (!query) return accounts
    return accounts.filter((account) =>
      account.site_name.toLowerCase().includes(query),
    )
  }, [accountSearch, accounts])

  const tableRows = useMemo<UsageHistoryAccountRow[]>(() => {
    return filteredAccounts.map((account) => {
      const status = store?.accounts?.[account.id]?.status
      const state = status?.state ?? "never"
      const lastSyncAtMs =
        typeof status?.lastSyncAt === "number" ? status.lastSyncAt : null
      const lastSyncAtLabel = lastSyncAtMs
        ? new Date(lastSyncAtMs).toLocaleString()
        : t("status.never")

      return {
        id: account.id,
        siteName: account.site_name,
        state,
        lastSyncAtMs,
        lastSyncAtLabel,
        lastError: status?.lastError,
        lastWarning: status?.lastWarning,
      }
    })
  }, [filteredAccounts, store, t])

  const handleApplySettings = useCallback(async () => {
    try {
      const response = await sendRuntimeMessage({
        action: "usageHistory:updateSettings",
        settings: {
          enabled,
          retentionDays,
          scheduleMode,
          syncIntervalMinutes,
        },
      })

      if (!response?.success) {
        throw new Error(response?.error || "Unknown error")
      }

      if (response?.data?.warning) {
        toast(
          t("messages.warning.scheduleFallback", {
            warning: response.data.warning,
          }),
        )
      } else {
        toast.success(t("messages.success.settingsSaved"))
      }

      await loadPreferences()
      await loadData()
    } catch (error) {
      toast.error(
        t("messages.error.settingsSaveFailed", {
          error: getErrorMessage(error),
        }),
      )
    }
  }, [
    enabled,
    loadData,
    loadPreferences,
    retentionDays,
    scheduleMode,
    syncIntervalMinutes,
    t,
  ])

  /**
   * Trigger a forced manual sync for all accounts, or for an explicit subset.
   * Uses runtime messaging so background can enforce serialization and persistence.
   */
  const handleManualSync = useCallback(
    async (accountIds?: string[]) => {
      const hasSelection = Boolean(accountIds?.length)
      const nextAccountIds = hasSelection ? accountIds : undefined

      if (nextAccountIds?.length) {
        setSyncingAccountIds((prev) => {
          const next = new Set(prev)
          nextAccountIds.forEach((id) => next.add(id))
          return next
        })
      } else {
        setIsSyncingAll(true)
      }

      let toastId: string | undefined
      try {
        toastId = toast.loading(t("messages.loading.syncing"))
        const response = await sendRuntimeMessage({
          action: "usageHistory:syncNow",
          ...(nextAccountIds ? { accountIds: nextAccountIds } : {}),
        })

        if (!response?.success) {
          throw new Error(response?.error || "Unknown error")
        }

        const totals = response?.data?.totals
        if (totals) {
          toast.success(
            t("messages.success.syncCompleted", {
              success: totals.success ?? 0,
              skipped: totals.skipped ?? 0,
              error: totals.error ?? 0,
              unsupported: totals.unsupported ?? 0,
            }),
            { id: toastId },
          )
        } else {
          toast.success(t("messages.success.syncCompletedNoSummary"), {
            id: toastId,
          })
        }

        await loadData()
      } catch (error) {
        toast.error(
          t("messages.error.syncFailed", { error: getErrorMessage(error) }),
          {
            id: toastId,
          },
        )
      } finally {
        if (nextAccountIds?.length) {
          setSyncingAccountIds((prev) => {
            const next = new Set(prev)
            nextAccountIds.forEach((id) => next.delete(id))
            return next
          })
        } else {
          setIsSyncingAll(false)
        }
      }
    },
    [loadData, t],
  )

  const handleSyncNow = useCallback(async () => {
    await handleManualSync()
  }, [handleManualSync])

  const alarmsSupported = hasAlarmsAPI()

  return (
    <div className="space-y-6">
      <UsageHistorySyncSettingsSection
        enabled={enabled}
        onEnabledChange={setEnabled}
        retentionDays={retentionDays}
        onRetentionDaysChange={setRetentionDays}
        scheduleMode={scheduleMode}
        onScheduleModeChange={setScheduleMode}
        syncIntervalMinutes={syncIntervalMinutes}
        onSyncIntervalMinutesChange={setSyncIntervalMinutes}
        alarmsSupported={alarmsSupported}
        isLoading={isLoading}
        isSyncingAll={isSyncingAll}
        onApplySettings={handleApplySettings}
        onSyncNow={handleSyncNow}
        onRefreshStatus={loadData}
      />

      <SettingSection
        id="usage-history-sync-state"
        title={t("syncTab.stateTitle")}
        description={t("syncTab.stateDescription")}
      >
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Input
                value={accountSearch}
                onChange={(event) => setAccountSearch(event.target.value)}
                placeholder={t("syncTab.searchPlaceholder")}
              />
            </div>

            <UsageHistorySyncStateTable
              rows={tableRows}
              isLoading={isLoading}
              hasAnyAccounts={accounts.length > 0}
              isSyncingAll={isSyncingAll}
              syncingAccountIds={syncingAccountIds}
              onSyncAccounts={handleManualSync}
            />
          </CardContent>
        </Card>
      </SettingSection>
    </div>
  )
}
