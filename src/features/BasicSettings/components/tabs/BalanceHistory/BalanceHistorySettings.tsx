import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Switch,
} from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import toast from "~/lib/notify"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { hasAlarmsAPI, sendRuntimeMessage } from "~/utils/browser/browserApi"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/feedback/preferenceFeedback"
import { matchesDefaultSettings } from "~/utils/preferences/matchesDefaultSettings"

const logger = createLogger("BalanceHistorySettings")

/**
 * Balance-history capture settings (enable/retention/end-of-day capture) hosted in Basic Settings.
 * Kept separate from the visualization page to avoid mixing configuration with charts.
 */
export default function BalanceHistorySettings() {
  const { t } = useTranslation("balanceHistory")
  const { preferences, updateBalanceHistory } = useUserPreferencesContext()

  const [enabled, setEnabled] = useState<boolean>(
    preferences.balanceHistory?.enabled ??
      DEFAULT_BALANCE_HISTORY_PREFERENCES.enabled,
  )
  const [endOfDayCaptureEnabled, setEndOfDayCaptureEnabled] = useState<boolean>(
    preferences.balanceHistory?.endOfDayCapture?.enabled ?? false,
  )
  const [estimatedTodayIncomeEnabled, setEstimatedTodayIncomeEnabled] =
    useState<boolean>(
      preferences.balanceHistory?.estimatedTodayIncome?.enabled ?? false,
    )
  const [retentionDays, setRetentionDays] = useState(
    String(
      preferences.balanceHistory?.retentionDays ??
        DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
    ),
  )
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setEnabled(
      preferences.balanceHistory?.enabled ??
        DEFAULT_BALANCE_HISTORY_PREFERENCES.enabled,
    )
    setEndOfDayCaptureEnabled(
      preferences.balanceHistory?.endOfDayCapture?.enabled ?? false,
    )
    setEstimatedTodayIncomeEnabled(
      preferences.balanceHistory?.estimatedTodayIncome?.enabled ?? false,
    )
  }, [preferences.balanceHistory])

  useEffect(() => {
    setRetentionDays(
      String(
        preferences.balanceHistory?.retentionDays ??
          DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
      ),
    )
  }, [preferences.balanceHistory?.retentionDays])

  const alarmsSupported = hasAlarmsAPI()
  const showDebugSeedAction = isDevelopmentMode()

  const safeRetentionDays = Number(retentionDays)
  const retentionValid =
    Number.isSafeInteger(safeRetentionDays) && safeRetentionDays >= 1

  const handleApplySettings = useCallback(async () => {
    if (!retentionValid || isSaving) return
    setIsSaving(true)
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.savingSettings"))
      const writeResult = await updateBalanceHistory({
        retentionDays: safeRetentionDays,
      })

      if (!writeResult.ok) {
        toast.error(
          getPreferenceWriteFailureMessage(writeResult.reason, {
            fallback: t("settings:messages.saveSettingsFailed"),
          }),
          { id: toastId },
        )
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
    } finally {
      setIsSaving(false)
    }
  }, [safeRetentionDays, retentionValid, isSaving, t, updateBalanceHistory])
  const saveToggle = async (
    updates: Parameters<typeof updateBalanceHistory>[0],
    accept: () => void,
  ) => {
    setIsSaving(true)
    try {
      const result = await updateBalanceHistory(updates)
      if (result.ok) accept()
      else toast.error(t("settings:messages.saveSettingsFailed"))
    } catch {
      toast.error(t("settings:messages.saveSettingsFailed"))
    } finally {
      setIsSaving(false)
    }
  }

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
      resetRequiresConfirmation={
        (preferences.balanceHistory?.retentionDays ??
          DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays) >
        DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays
      }
      resetDescription={t("settings:messages.resetHistoryConfirmDesc")}
      resetDisabled={
        isSaving ||
        (matchesDefaultSettings(
          preferences.balanceHistory,
          DEFAULT_BALANCE_HISTORY_PREFERENCES,
        ) &&
          Number(retentionDays) ===
            DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays)
      }
      onReset={async () => {
        const result = await updateBalanceHistory(
          DEFAULT_BALANCE_HISTORY_PREFERENCES,
        )
        if (result.ok) {
          setEnabled(DEFAULT_BALANCE_HISTORY_PREFERENCES.enabled)
          setEndOfDayCaptureEnabled(
            DEFAULT_BALANCE_HISTORY_PREFERENCES.endOfDayCapture.enabled,
          )
          setEstimatedTodayIncomeEnabled(
            DEFAULT_BALANCE_HISTORY_PREFERENCES.estimatedTodayIncome.enabled,
          )
          setRetentionDays(
            String(DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays),
          )
        }
        return result
      }}
      id="balance-history"
      title={t("title")}
      description={t("description")}
    >
      <Card>
        <CardContent className="space-y-density-4">
          <div
            id="balance-history-enabled"
            className="gap-y-density-3 flex items-center justify-between gap-x-3"
          >
            <div>
              <Label className="text-sm font-medium">
                {t("settings.enabled")}
              </Label>
              <div className="text-muted-foreground text-xs">
                {t("settings.enabledHint")}
              </div>
            </div>
            <Switch
              aria-label={t("settings.enabled")}
              checked={enabled}
              onChange={(value) =>
                void saveToggle({ enabled: value }, () => setEnabled(value))
              }
              disabled={isSaving}
            />
          </div>

          <div
            id="balance-history-end-of-day-capture"
            className="gap-y-density-3 flex items-center justify-between gap-x-3"
          >
            <div>
              <Label className="text-sm font-medium">
                {t("settings.endOfDayCapture")}
              </Label>
              <div className="text-muted-foreground text-xs">
                {t("settings.endOfDayCaptureHint", { time: "23:55" })}
              </div>
            </div>
            <Switch
              aria-label={t("settings.endOfDayCapture")}
              checked={endOfDayCaptureEnabled}
              onChange={(value) =>
                void saveToggle({ endOfDayCapture: { enabled: value } }, () =>
                  setEndOfDayCaptureEnabled(value),
                )
              }
              disabled={!alarmsSupported || isSaving}
            />
          </div>

          <div
            id="balance-history-estimated-today-income"
            className="gap-y-density-3 flex items-center justify-between gap-x-3"
          >
            <div>
              <Label className="text-sm font-medium">
                {t("settings.estimatedTodayIncome")}
              </Label>
              <div className="text-muted-foreground text-xs">
                {t("settings.estimatedTodayIncomeHint")}
              </div>
            </div>
            <Switch
              aria-label={t("settings.estimatedTodayIncome")}
              checked={estimatedTodayIncomeEnabled}
              onChange={(value) =>
                void saveToggle(
                  { estimatedTodayIncome: { enabled: value } },
                  () => setEstimatedTodayIncomeEnabled(value),
                )
              }
              disabled={isSaving}
            />
          </div>

          {!alarmsSupported && (
            <div className="text-muted-foreground text-xs">
              {t("settings.alarmUnsupported")}
            </div>
          )}

          <div
            id="balance-history-retention-days"
            className="gap-y-density-2 grid grid-cols-1 gap-x-2"
          >
            <Label
              htmlFor="balance-history-retention-days-input"
              className="text-sm font-medium"
            >
              {t("settings.retentionDays")}
            </Label>
            <Input
              id="balance-history-retention-days-input"
              type="number"
              min={1}
              value={retentionDays}
              required
              disabled={isSaving}
              aria-label={t("settings.retentionDays")}
              onChange={(event) => setRetentionDays(event.target.value)}
            />
          </div>

          <p className="text-muted-foreground text-sm">
            {t("settings:messages.retentionSaveHint")}
          </p>
          <ActionGroup className="items-stretch justify-start">
            <Button
              id="balance-history-apply-settings"
              disabled={!retentionValid || isSaving}
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
          </ActionGroup>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
