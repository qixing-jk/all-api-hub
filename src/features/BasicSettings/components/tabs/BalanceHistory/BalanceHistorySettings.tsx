import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Switch,
} from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { clampBalanceHistoryRetentionDays } from "~/services/history/dailyBalanceHistory/utils"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { hasAlarmsAPI, sendRuntimeMessage } from "~/utils/browser/browserApi"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("BalanceHistorySettings")

/**
 * Balance-history capture settings (enable/retention/end-of-day capture) hosted in Basic Settings.
 * Kept separate from the visualization page to avoid mixing configuration with charts.
 */
export default function BalanceHistorySettings() {
  const { t } = useTranslation("balanceHistory")
  const { preferences, updateBalanceHistory } = useUserPreferencesContext()

  const [enabled, setEnabled] = useState<boolean>(
    preferences.balanceHistory?.enabled ?? false,
  )
  const [endOfDayCaptureEnabled, setEndOfDayCaptureEnabled] = useState<boolean>(
    preferences.balanceHistory?.endOfDayCapture?.enabled ?? false,
  )
  const [estimatedTodayIncomeEnabled, setEstimatedTodayIncomeEnabled] =
    useState<boolean>(
      preferences.balanceHistory?.estimatedTodayIncome?.enabled ?? false,
    )
  const [retentionDays, setRetentionDays] = useState<number>(
    preferences.balanceHistory?.retentionDays ??
      DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
  )

  useEffect(() => {
    setEnabled(preferences.balanceHistory?.enabled ?? false)
    setEndOfDayCaptureEnabled(
      preferences.balanceHistory?.endOfDayCapture?.enabled ?? false,
    )
    setEstimatedTodayIncomeEnabled(
      preferences.balanceHistory?.estimatedTodayIncome?.enabled ?? false,
    )
    setRetentionDays(
      preferences.balanceHistory?.retentionDays ??
        DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
    )
  }, [preferences.balanceHistory])

  const alarmsSupported = hasAlarmsAPI()
  const showDebugSeedAction = isDevelopmentMode()

  const safeRetentionDays = useMemo(
    () => clampBalanceHistoryRetentionDays(retentionDays),
    [retentionDays],
  )

  const handleApplySettings = useCallback(async () => {
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.savingSettings"))
      const writeResult = await updateBalanceHistory({
        enabled,
        endOfDayCapture: { enabled: endOfDayCaptureEnabled },
        estimatedTodayIncome: { enabled: estimatedTodayIncomeEnabled },
        retentionDays: safeRetentionDays,
      })

      if (!writeResult.ok) {
        toast.error(t("settings:messages.saveSettingsFailed"), { id: toastId })
        return
      }

      toast.success(t("messages.success.settingsSaved"), { id: toastId })
    } catch (error) {
      logger.error("Failed to save balance history settings", error)
      toast.error(
        t("messages.error.settingsSaveFailed", {
          error: getErrorMessage(error),
        }),
        { id: toastId },
      )
    }
  }, [
    enabled,
    endOfDayCaptureEnabled,
    estimatedTodayIncomeEnabled,
    safeRetentionDays,
    t,
    updateBalanceHistory,
  ])

  const handleSeedEstimateSnapshots = useCallback(async () => {
    let toastId: string | undefined
    try {
      toastId = toast.loading("Seeding estimated income snapshots…")
      const response = await sendRuntimeMessage<{
        success: boolean
        data?: { seeded: number; skipped: number }
        error?: string
      }>({
        action: RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots,
      })

      if (!response?.success) {
        toast.error(response?.error ?? "Failed to seed test snapshots", {
          id: toastId,
        })
        return
      }

      toast.success(
        `Seeded ${response.data?.seeded ?? 0} account(s), skipped ${response.data?.skipped ?? 0}. Check Popup stats or Balance History metrics.`,
        { id: toastId },
      )
    } catch (error) {
      logger.error("Failed to seed estimated income test snapshots", error)
      toast.error(getErrorMessage(error), { id: toastId })
    }
  }, [])

  return (
    <SettingSection
      id="balance-history"
      title={t("title")}
      description={t("description")}
    >
      <Card>
        <CardContent className="space-y-4">
          <div
            id="balance-history-enabled"
            className="flex items-center justify-between gap-3"
          >
            <div>
              <Label className="text-sm font-medium">
                {t("settings.enabled")}
              </Label>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("settings.enabledHint")}
              </div>
            </div>
            <Switch
              aria-label={t("settings.enabled")}
              checked={enabled}
              onChange={setEnabled}
            />
          </div>

          <div
            id="balance-history-end-of-day-capture"
            className="flex items-center justify-between gap-3"
          >
            <div>
              <Label className="text-sm font-medium">
                {t("settings.endOfDayCapture")}
              </Label>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("settings.endOfDayCaptureHint", { time: "23:55" })}
              </div>
            </div>
            <Switch
              aria-label={t("settings.endOfDayCapture")}
              checked={endOfDayCaptureEnabled}
              onChange={setEndOfDayCaptureEnabled}
              disabled={!alarmsSupported}
            />
          </div>

          <div
            id="balance-history-estimated-today-income"
            className="flex items-center justify-between gap-3"
          >
            <div>
              <Label className="text-sm font-medium">
                {t("settings.estimatedTodayIncome")}
              </Label>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("settings.estimatedTodayIncomeHint")}
              </div>
            </div>
            <Switch
              aria-label={t("settings.estimatedTodayIncome")}
              checked={estimatedTodayIncomeEnabled}
              onChange={setEstimatedTodayIncomeEnabled}
            />
          </div>

          {!alarmsSupported && (
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("settings.alarmUnsupported")}
            </div>
          )}

          <div
            id="balance-history-retention-days"
            className="grid grid-cols-1 gap-2"
          >
            <Label className="text-sm font-medium">
              {t("settings.retentionDays")}
            </Label>
            <Input
              type="number"
              min={1}
              max={3650}
              value={safeRetentionDays}
              aria-label={t("settings.retentionDays")}
              onChange={(event) => setRetentionDays(Number(event.target.value))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              id="balance-history-apply-settings"
              variant="default"
              size="sm"
              onClick={() => void handleApplySettings()}
            >
              {t("actions.applySettings")}
            </Button>
            {showDebugSeedAction && (
              <Button
                id="balance-history-debug-seed-estimate-snapshots"
                variant="secondary"
                size="sm"
                onClick={() => void handleSeedEstimateSnapshots()}
              >
                Dev: Seed estimate snapshots
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
