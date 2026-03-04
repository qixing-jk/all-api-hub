import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
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
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"

interface UsageHistorySyncSettingsSectionProps {
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  retentionDays: number
  onRetentionDaysChange: (value: number) => void
  scheduleMode: string
  onScheduleModeChange: (value: string) => void
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

  return (
    <SettingSection
      id="usage-history-sync"
      title={t("syncTab.settingsTitle")}
      description={t("syncTab.settingsDescription")}
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
            <Switch checked={enabled} onChange={onEnabledChange} />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label className="text-sm font-medium">
              {t("settings.retentionDays")}
            </Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={retentionDays}
              onChange={(event) =>
                onRetentionDaysChange(Number(event.target.value))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label className="text-sm font-medium">
              {t("settings.scheduleMode")}
            </Label>
            <Select value={scheduleMode} onValueChange={onScheduleModeChange}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t("settings.scheduleModePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={USAGE_HISTORY_SCHEDULE_MODE.MANUAL}>
                  {t("settings.scheduleModes.manual")}
                </SelectItem>
                <SelectItem value={USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH}>
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
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("settings.alarmUnsupported")}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label className="text-sm font-medium">
              {t("settings.syncIntervalHours")}
            </Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={Math.max(1, Math.round(syncIntervalMinutes / 60))}
              onChange={(event) => {
                const hours = Number(event.target.value)
                onSyncIntervalMinutesChange(Math.max(1, Math.trunc(hours)) * 60)
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => void onApplySettings()}
            >
              {t("actions.applySettings")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void onSyncNow()}
              disabled={isSyncingAll}
            >
              {t("actions.syncNow")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onRefreshStatus()}
              disabled={isLoading || isSyncingAll}
            >
              {t("syncTab.actions.refreshStatus")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
