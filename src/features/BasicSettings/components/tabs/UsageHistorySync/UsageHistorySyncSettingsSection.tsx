import { useEffect, useRef, useState, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import {
  DEFAULT_USAGE_HISTORY_PREFERENCES,
  USAGE_HISTORY_SCHEDULE_MODE,
} from "~/types/usageHistory"
import type { UsageHistoryScheduleMode } from "~/types/usageHistory"

interface UsageHistorySyncSettingsSectionProps {
  reset: Required<
    Pick<
      ComponentProps<typeof SettingSection>,
      "onReset" | "resetDisabled" | "resetRequiresConfirmation"
    >
  >
  isSavingSettings?: boolean
  onSyncIntervalMinutesCommit?: (value: number) => Promise<boolean>
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  retentionDays: number
  onRetentionDaysChange: (value: number) => void
  scheduleMode: UsageHistoryScheduleMode
  onScheduleModeChange: (value: UsageHistoryScheduleMode) => void
  syncIntervalMinutes: number
  onSyncIntervalMinutesChange: (value: number) => void
  alarmsSupported: boolean
  isLoading: boolean
  isSyncingAll: boolean
  onApplySettings: () => void | Promise<void>
  onSyncNow: () => void | Promise<void>
  onRefreshStatus: () => void | Promise<void>
}

/**
 * Usage-history synchronization settings section (enable/retention/schedule + actions).
 */
export default function UsageHistorySyncSettingsSection({
  reset,
  isSavingSettings = false,
  onSyncIntervalMinutesCommit,
  enabled,
  onEnabledChange,
  retentionDays,
  onRetentionDaysChange,
  scheduleMode,
  onScheduleModeChange,
  syncIntervalMinutes,
  onSyncIntervalMinutesChange,
  alarmsSupported,
  isLoading,
  isSyncingAll,
  onApplySettings,
  onSyncNow,
  onRefreshStatus,
}: UsageHistorySyncSettingsSectionProps) {
  const { t } = useTranslation("usageAnalytics")
  const applyButtonRef = useRef<HTMLButtonElement>(null)
  const intervalInputRef = useRef<HTMLInputElement>(null)

  const [intervalDraft, setIntervalDraft] = useState(
    String(syncIntervalMinutes / 60),
  )
  useEffect(
    () => setIntervalDraft(String(syncIntervalMinutes / 60)),
    [syncIntervalMinutes],
  )

  const commitInterval = () => {
    if (
      intervalInputRef.current?.reportValidity() &&
      onSyncIntervalMinutesCommit &&
      Number(intervalDraft) * 60 !== syncIntervalMinutes
    ) {
      return onSyncIntervalMinutesCommit(Number(intervalDraft) * 60)
    }
  }

  return (
    <SettingSection
      {...reset}
      resetDisabled={
        isSavingSettings ||
        (reset.resetDisabled &&
          Number(intervalDraft) * 60 ===
            DEFAULT_USAGE_HISTORY_PREFERENCES.syncIntervalMinutes)
      }
      onReset={async () => {
        const result = await reset.onReset()
        if (result.ok)
          setIntervalDraft(
            String(DEFAULT_USAGE_HISTORY_PREFERENCES.syncIntervalMinutes / 60),
          )
        return result
      }}
      resetDescription={t("settings:messages.resetHistoryConfirmDesc")}
      id="usage-history-sync"
      title={t("syncTab.settingsTitle")}
      description={t("syncTab.settingsDescription")}
    >
      <Card>
        <CardContent className="space-y-density-4">
          <div className="gap-y-density-3 flex items-center justify-between gap-x-3">
            <div id="usage-history-sync-enabled">
              <Label className="text-sm font-medium">
                {t("settings.enabled")}
              </Label>
              <div className="text-muted-foreground text-xs">
                {t("settings.enabledHint")}
              </div>
            </div>
            <Switch
              checked={enabled}
              onChange={onEnabledChange}
              disabled={isSavingSettings}
            />
          </div>

          <div
            id="usage-history-sync-retention-days"
            className="gap-y-density-2 grid grid-cols-1 gap-x-2"
          >
            <Label className="text-sm font-medium">
              {t("settings.retentionDays")}
            </Label>
            <Input
              type="number"
              min={1}
              value={retentionDays}
              onChange={(event) =>
                onRetentionDaysChange(Number(event.target.value))
              }
            />
          </div>

          <div className="gap-y-density-2 grid grid-cols-1 gap-x-2">
            <Label
              htmlFor="usage-history-sync-schedule-mode"
              className="text-sm font-medium"
            >
              {t("settings.scheduleMode")}
            </Label>
            <Select
              value={scheduleMode}
              disabled={isSavingSettings}
              onValueChange={(value) =>
                onScheduleModeChange(value as UsageHistoryScheduleMode)
              }
            >
              <SelectTrigger id="usage-history-sync-schedule-mode">
                <SelectValue
                  placeholder={t("settings.scheduleModePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={USAGE_HISTORY_SCHEDULE_MODE.MANUAL}>
                  {t("settings.scheduleModes.manual")}
                </SelectItem>
                <SelectItem
                  value={USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH}
                  data-testid={
                    BASIC_SETTINGS_TEST_IDS.usageHistorySyncScheduleModeAfterRefreshOption
                  }
                >
                  {t("settings.scheduleModes.afterRefresh")}
                </SelectItem>
                <SelectItem
                  value={USAGE_HISTORY_SCHEDULE_MODE.ALARM}
                  disabled={!alarmsSupported}
                >
                  {t("settings.scheduleModes.alarm")}
                </SelectItem>
              </SelectContent>
            </Select>
            {!alarmsSupported && (
              <div className="text-muted-foreground text-xs">
                {t("settings.alarmUnsupported")}
              </div>
            )}
          </div>

          <div
            id="usage-history-sync-interval-hours"
            className="gap-y-density-2 grid grid-cols-1 gap-x-2"
          >
            <Label className="text-sm font-medium">
              {t("settings.syncIntervalHours")}
            </Label>
            <Input
              type="number"
              min={1}
              max={24}
              ref={intervalInputRef}
              value={intervalDraft}
              disabled={isSavingSettings}
              required
              onBlur={(event) => {
                // Let Apply sequence both writes instead of disabling itself
                // between the pointer-down blur and its click event.
                if (event.relatedTarget !== applyButtonRef.current)
                  void commitInterval()
              }}
              onKeyDown={blurInputOnEnter}
              onChange={(event) => {
                setIntervalDraft(event.target.value)
                if (!onSyncIntervalMinutesCommit)
                  onSyncIntervalMinutesChange(Number(event.target.value) * 60)
              }}
            />
          </div>

          <p className="text-muted-foreground text-sm">
            {t("settings:messages.retentionSaveHint")}
          </p>
          <div className="gap-y-density-2 flex flex-wrap gap-x-2">
            <Button
              id="usage-history-sync-apply-settings"
              ref={applyButtonRef}
              disabled={
                isSavingSettings ||
                !Number.isSafeInteger(retentionDays) ||
                retentionDays < 1
              }
              variant="default"
              size="sm"
              onBlur={() => {
                if (!isSavingSettings) void commitInterval()
              }}
              onClick={async () => {
                if ((await commitInterval()) === false) return
                await onApplySettings()
              }}
            >
              {t("actions.applySettings")}
            </Button>
            <Button
              id="usage-history-sync-sync-now"
              variant="secondary"
              size="sm"
              onClick={() => void onSyncNow()}
              loading={isSyncingAll}
            >
              {isSyncingAll
                ? t("messages.loading.syncing")
                : t("actions.syncNow")}
            </Button>
            <Button
              id="usage-history-sync-refresh-status"
              variant="outline"
              size="sm"
              onClick={() => void onRefreshStatus()}
              disabled={isSyncingAll}
              loading={isLoading}
            >
              {isLoading
                ? t("common:status.refreshing")
                : t("syncTab.actions.refreshStatus")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
