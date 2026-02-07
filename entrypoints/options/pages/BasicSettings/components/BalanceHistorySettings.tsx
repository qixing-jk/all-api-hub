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
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { clampBalanceHistoryRetentionDays } from "~/services/dailyBalanceHistory/utils"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { hasAlarmsAPI } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

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
  const [retentionDays, setRetentionDays] = useState<number>(
    preferences.balanceHistory?.retentionDays ??
      DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
  )

  useEffect(() => {
    setEnabled(preferences.balanceHistory?.enabled ?? false)
    setEndOfDayCaptureEnabled(
      preferences.balanceHistory?.endOfDayCapture?.enabled ?? false,
    )
    setRetentionDays(
      preferences.balanceHistory?.retentionDays ??
        DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
    )
  }, [preferences.balanceHistory])

  const alarmsSupported = hasAlarmsAPI()

  const safeRetentionDays = useMemo(
    () => clampBalanceHistoryRetentionDays(retentionDays),
    [retentionDays],
  )

  const handleApplySettings = useCallback(async () => {
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.savingSettings"))
      const success = await updateBalanceHistory({
        enabled,
        endOfDayCapture: { enabled: endOfDayCaptureEnabled },
        retentionDays: safeRetentionDays,
      })

      if (!success) {
        toast.error(t("settings:messages.saveSettingsFailed"))
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
    safeRetentionDays,
    t,
    updateBalanceHistory,
  ])

  return (
    <SettingSection
      id="balance-history"
      title={t("title")}
      description={t("description")}
    >
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-medium">
                {t("settings.enabled")}
              </Label>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("settings.enabledHint")}
              </div>
            </div>
            <Switch checked={enabled} onChange={setEnabled} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-medium">
                {t("settings.endOfDayCapture")}
              </Label>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("settings.endOfDayCaptureHint", { time: "23:55" })}
              </div>
            </div>
            <Switch
              checked={endOfDayCaptureEnabled}
              onChange={setEndOfDayCaptureEnabled}
              disabled={!alarmsSupported}
            />
          </div>

          {!alarmsSupported && (
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("settings.alarmUnsupported")}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
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
              variant="default"
              size="sm"
              onClick={() => void handleApplySettings()}
            >
              {t("actions.applySettings")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
