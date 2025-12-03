import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline"
import { useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardItem,
  CardList,
  Input,
  Switch,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  AutoCheckinPreferences,
  AutoCheckinScheduleMode,
} from "~/types/autoCheckin"
import { navigateWithinOptionsPage } from "~/utils/navigation"

export default function AutoCheckinSettings() {
  const { t } = useTranslation(["autoCheckin", "settings"])
  const {
    preferences: userPrefs,
    updateAutoCheckin,
    resetAutoCheckinConfig,
  } = useUserPreferencesContext()
  const [isSaving, setIsSaving] = useState(false)

  const preferences = userPrefs?.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
  const retryPreferences = preferences.retryStrategy ?? {
    enabled: false,
    intervalMinutes: 30,
    maxAttemptsPerDay: 3,
  }

  const scheduleModes = useMemo(
    () => [
      {
        value: AUTO_CHECKIN_SCHEDULE_MODE.RANDOM,
        label: t("autoCheckin:settings.scheduleModeRandom"),
      },
      {
        value: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        label: t("autoCheckin:settings.scheduleModeDeterministic"),
      },
    ],
    [t],
  )

  const savePreferences = async (updates: Partial<AutoCheckinPreferences>) => {
    try {
      setIsSaving(true)
      const success = await updateAutoCheckin(updates)

      if (success) {
        toast.success(t("autoCheckin:messages.success.settingsSaved"))
      } else {
        toast.error(t("settings:messages.saveSettingsFailed"))
      }
    } catch (error) {
      console.error("Failed to save preferences:", error)
      toast.error(t("settings:messages.saveSettingsFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleNavigateToExecution = () => {
    navigateWithinOptionsPage("#autoCheckin")
  }

  const validateTimeWindow = (start: string, end: string): boolean => {
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)

    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
      return false
    }

    // Start should not equal end
    if (startH === endH && startM === endM) {
      return false
    }

    return true
  }

  const validateTimeFormat = (time: string): boolean => {
    const [hour, minute] = time.split(":").map(Number)
    return (
      Number.isInteger(hour) &&
      Number.isInteger(minute) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    )
  }

  const isTimeWithinWindow = (
    time: string,
    start: string,
    end: string,
  ): boolean => {
    const [timeH, timeM] = time.split(":").map(Number)
    const [startH, startM] = start.split(":").map(Number)
    const [endH, endM] = end.split(":").map(Number)

    const toMinutes = (h: number, m: number) => h * 60 + m
    const timeMinutes = toMinutes(timeH, timeM)
    const startMinutes = toMinutes(startH, startM)
    const endMinutes = toMinutes(endH, endM)

    if (endMinutes > startMinutes) {
      return timeMinutes >= startMinutes && timeMinutes <= endMinutes
    }

    // Window crosses midnight
    return timeMinutes >= startMinutes || timeMinutes <= endMinutes
  }

  const saveRetryPreferences = async (
    updates: Partial<AutoCheckinPreferences["retryStrategy"]>,
  ) => {
    await savePreferences({
      retryStrategy: {
        ...retryPreferences,
        ...updates,
      },
    })
  }

  return (
    <SettingSection
      id="auto-checkin"
      title={t("autoCheckin:settings.title")}
      description={t("autoCheckin:description")}
      onReset={async () => {
        const result = await resetAutoCheckinConfig()
        if (result) {
          setIsSaving(false)
        }
        return result
      }}
    >
      <Card padding="none">
        <CardList>
          {/* Enable Auto Check-in */}
          <CardItem
            title={t("autoCheckin:settings.enable")}
            description={t("autoCheckin:settings.enableDesc")}
            rightContent={
              <Switch
                checked={preferences.globalEnabled}
                onChange={(checked) =>
                  savePreferences({ globalEnabled: checked })
                }
                disabled={isSaving}
              />
            }
          />

          {/* Time Window Start */}
          <CardItem
            title={t("autoCheckin:settings.windowStart")}
            description={t("autoCheckin:settings.windowStartDesc")}
            rightContent={
              <Input
                type="time"
                value={preferences.windowStart}
                onChange={(e) => {
                  const newStart = e.target.value
                  if (validateTimeWindow(newStart, preferences.windowEnd)) {
                    savePreferences({ windowStart: newStart })
                  } else {
                    toast.error(
                      t("autoCheckin:messages.error.invalidTimeWindow"),
                    )
                  }
                }}
                disabled={isSaving}
                className="w-32"
              />
            }
          />

          {/* Time Window End */}
          <CardItem
            title={t("autoCheckin:settings.windowEnd")}
            description={t("autoCheckin:settings.windowEndDesc")}
            rightContent={
              <Input
                type="time"
                value={preferences.windowEnd}
                onChange={(e) => {
                  const newEnd = e.target.value
                  if (validateTimeWindow(preferences.windowStart, newEnd)) {
                    savePreferences({ windowEnd: newEnd })
                  } else {
                    toast.error(
                      t("autoCheckin:messages.error.invalidTimeWindow"),
                    )
                  }
                }}
                disabled={isSaving}
                className="w-32"
              />
            }
          />

          {/* Schedule Mode */}
          <CardItem
            title={t("autoCheckin:settings.scheduleModeTitle")}
            description={t("autoCheckin:settings.scheduleModeDesc")}
            rightContent={
              <div className="flex gap-2">
                {scheduleModes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() =>
                      savePreferences({
                        scheduleMode: mode.value as AutoCheckinScheduleMode,
                      })
                    }
                    disabled={isSaving}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      preferences.scheduleMode === mode.value
                        ? "border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-400/10 dark:text-blue-200"
                        : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            }
          />

          {/* Deterministic Time */}
          {preferences.scheduleMode ===
            AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC && (
            <CardItem
              title={t("autoCheckin:settings.deterministicTimeTitle")}
              description={t("autoCheckin:settings.deterministicTimeDesc")}
              rightContent={
                <Input
                  type="time"
                  value={
                    preferences.deterministicTime ?? preferences.windowStart
                  }
                  onChange={(e) => {
                    const newTime = e.target.value
                    if (!validateTimeFormat(newTime)) {
                      toast.error(
                        t(
                          "autoCheckin:messages.error.invalidDeterministicTime",
                        ),
                      )
                      return
                    }
                    if (
                      !isTimeWithinWindow(
                        newTime,
                        preferences.windowStart,
                        preferences.windowEnd,
                      )
                    ) {
                      toast.error(
                        t(
                          "autoCheckin:messages.error.deterministicTimeOutsideWindow",
                        ),
                      )
                      return
                    }
                    void savePreferences({ deterministicTime: newTime })
                  }}
                  disabled={isSaving}
                  className="w-32"
                />
              }
            />
          )}

          {/* Retry Strategy */}
          <CardItem
            title={t("autoCheckin:settings.retryTitle")}
            description={t("autoCheckin:settings.retryDesc")}
            rightContent={
              <Switch
                checked={retryPreferences.enabled}
                onChange={(checked) =>
                  saveRetryPreferences({ enabled: checked })
                }
                disabled={isSaving}
              />
            }
          />

          <CardItem
            title={t("autoCheckin:settings.retryInterval")}
            description={t("autoCheckin:settings.retryIntervalDesc")}
            rightContent={
              <Input
                type="number"
                min={1}
                value={retryPreferences.intervalMinutes}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (Number.isNaN(value) || value <= 0) {
                    toast.error(t("autoCheckin:messages.error.invalidNumber"))
                    return
                  }
                  void saveRetryPreferences({ intervalMinutes: value })
                }}
                disabled={isSaving || !retryPreferences.enabled}
                className="w-32"
              />
            }
          />

          <CardItem
            title={t("autoCheckin:settings.retryMaxAttempts")}
            description={t("autoCheckin:settings.retryMaxAttemptsDesc")}
            rightContent={
              <Input
                type="number"
                min={1}
                value={retryPreferences.maxAttemptsPerDay}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (Number.isNaN(value) || value <= 0) {
                    toast.error(t("autoCheckin:messages.error.invalidNumber"))
                    return
                  }
                  void saveRetryPreferences({ maxAttemptsPerDay: value })
                }}
                disabled={isSaving || !retryPreferences.enabled}
                className="w-32"
              />
            }
          />

          {/* View Execution Button */}
          <CardItem
            title={t("autoCheckin:settings.viewExecution")}
            description={t("autoCheckin:settings.viewExecutionDesc")}
            rightContent={
              <Button
                onClick={handleNavigateToExecution}
                variant="default"
                size="sm"
                className="flex items-center gap-2"
                rightIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
              >
                <span>{t("autoCheckin:settings.viewExecutionButton")}</span>
              </Button>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
