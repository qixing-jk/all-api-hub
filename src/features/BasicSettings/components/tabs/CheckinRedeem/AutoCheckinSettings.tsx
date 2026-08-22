import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { ResponsiveToggleGroup } from "~/components/ResponsiveButtonGroup"
import { SettingSection } from "~/components/SettingSection"
import {
  Card,
  CardItem,
  CardList,
  Input,
  Switch,
  WorkflowTransitionButton,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinPreferences,
} from "~/types/autoCheckin"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/core/toastHelpers"
import { pushWithinOptionsPage } from "~/utils/navigation"

/**
 * Unified logger scoped to the Basic Settings auto check-in section.
 */
const logger = createLogger("AutoCheckinSettings")

const AUTO_CHECKIN_SETTINGS_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

type AutoCheckinInputDrafts = {
  windowStart: string
  windowEnd: string
  deterministicTime: string
  retryIntervalMinutes: string
  retryMaxAttemptsPerDay: string
}

/**
 * Applies partial preference updates before reporting the resulting strategy.
 */
/**
 * Basic settings panel for configuring auto check-in (window, schedule, retries, navigation).
 */
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
  const [inputDrafts, setInputDrafts] = useState<AutoCheckinInputDrafts>(
    () => ({
      windowStart: preferences.windowStart,
      windowEnd: preferences.windowEnd,
      deterministicTime:
        preferences.deterministicTime ?? preferences.windowStart,
      retryIntervalMinutes: String(retryPreferences.intervalMinutes),
      retryMaxAttemptsPerDay: String(retryPreferences.maxAttemptsPerDay),
    }),
  )

  useEffect(() => {
    setInputDrafts({
      windowStart: preferences.windowStart,
      windowEnd: preferences.windowEnd,
      deterministicTime:
        preferences.deterministicTime ?? preferences.windowStart,
      retryIntervalMinutes: String(retryPreferences.intervalMinutes),
      retryMaxAttemptsPerDay: String(retryPreferences.maxAttemptsPerDay),
    })
  }, [
    preferences.deterministicTime,
    preferences.windowEnd,
    preferences.windowStart,
    retryPreferences.intervalMinutes,
    retryPreferences.maxAttemptsPerDay,
  ])

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
      const writeResult = await updateAutoCheckin(updates)

      if (writeResult.ok) {
        toast.success(t("autoCheckin:messages.success.settingsSaved"))
        return true
      } else {
        toast.error(
          getPreferenceWriteFailureMessage(writeResult.reason, {
            fallback: t("settings:messages.saveSettingsFailed"),
          }),
        )
        return false
      }
    } catch (error) {
      logger.error("Failed to save preferences", error)
      toast.error(t("settings:messages.saveSettingsFailed"))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleNavigateToExecution = () => {
    void trackProductAnalyticsActionStarted({
      ...AUTO_CHECKIN_SETTINGS_ANALYTICS_CONTEXT,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAutoCheckinStatus,
    })
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.AUTO_CHECKIN}`)
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
    return savePreferences({
      retryStrategy: {
        ...retryPreferences,
        ...updates,
      },
    })
  }

  const updateInputDraft = (
    key: keyof AutoCheckinInputDrafts,
    value: string,
  ) => {
    setInputDrafts((current) => ({ ...current, [key]: value }))
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur()
    }
  }

  const handleWindowStartBlur = async () => {
    const nextValue = inputDrafts.windowStart
    if (
      !validateTimeFormat(nextValue) ||
      !validateTimeWindow(nextValue, preferences.windowEnd)
    ) {
      toast.error(t("autoCheckin:messages.error.invalidTimeWindow"))
      updateInputDraft("windowStart", preferences.windowStart)
      return
    }
    if (nextValue === preferences.windowStart) return

    const saved = await savePreferences({ windowStart: nextValue })
    if (!saved) updateInputDraft("windowStart", preferences.windowStart)
  }

  const handleWindowEndBlur = async () => {
    const nextValue = inputDrafts.windowEnd
    if (
      !validateTimeFormat(nextValue) ||
      !validateTimeWindow(preferences.windowStart, nextValue)
    ) {
      toast.error(t("autoCheckin:messages.error.invalidTimeWindow"))
      updateInputDraft("windowEnd", preferences.windowEnd)
      return
    }
    if (nextValue === preferences.windowEnd) return

    const saved = await savePreferences({ windowEnd: nextValue })
    if (!saved) updateInputDraft("windowEnd", preferences.windowEnd)
  }

  const handleDeterministicTimeBlur = async () => {
    const nextValue = inputDrafts.deterministicTime
    const persistedValue =
      preferences.deterministicTime ?? preferences.windowStart
    if (!validateTimeFormat(nextValue)) {
      toast.error(t("autoCheckin:messages.error.invalidDeterministicTime"))
      updateInputDraft("deterministicTime", persistedValue)
      return
    }
    if (
      !isTimeWithinWindow(
        nextValue,
        preferences.windowStart,
        preferences.windowEnd,
      )
    ) {
      toast.error(
        t("autoCheckin:messages.error.deterministicTimeOutsideWindow"),
      )
      updateInputDraft("deterministicTime", persistedValue)
      return
    }
    if (nextValue === persistedValue) return

    const saved = await savePreferences({ deterministicTime: nextValue })
    if (!saved) updateInputDraft("deterministicTime", persistedValue)
  }

  const handleRetryNumberBlur = async (
    key: "retryIntervalMinutes" | "retryMaxAttemptsPerDay",
  ) => {
    const persistedValue =
      key === "retryIntervalMinutes"
        ? retryPreferences.intervalMinutes
        : retryPreferences.maxAttemptsPerDay
    const nextValue = Number(inputDrafts[key])
    if (
      inputDrafts[key].trim() === "" ||
      !Number.isInteger(nextValue) ||
      nextValue <= 0
    ) {
      toast.error(t("autoCheckin:messages.error.invalidNumber"))
      updateInputDraft(key, String(persistedValue))
      return
    }
    if (nextValue === persistedValue) return

    const saved = await saveRetryPreferences(
      key === "retryIntervalMinutes"
        ? { intervalMinutes: nextValue }
        : { maxAttemptsPerDay: nextValue },
    )
    if (!saved) updateInputDraft(key, String(persistedValue))
  }

  return (
    <SettingSection
      id="auto-checkin"
      title={t("autoCheckin:settings.title")}
      description={t("autoCheckin:description")}
      onReset={async () => {
        const result = await resetAutoCheckinConfig()
        if (result.ok) {
          setIsSaving(false)
        }
        return result
      }}
    >
      <Card padding="none">
        <CardList>
          {/* Enable Auto Check-in */}
          <CardItem
            id="auto-checkin-enable"
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

          {/* UI-open daily pre-trigger */}
          <CardItem
            id="auto-checkin-pretrigger-ui-open"
            title={t("autoCheckin:settings.pretriggerDailyOnUiOpen")}
            description={t("autoCheckin:settings.pretriggerDailyOnUiOpenDesc")}
            rightContent={
              <Switch
                checked={preferences.pretriggerDailyOnUiOpen}
                onChange={(checked) =>
                  savePreferences({ pretriggerDailyOnUiOpen: checked })
                }
                disabled={isSaving}
              />
            }
          />

          {/* Post-run UI refresh notification */}
          <CardItem
            id="auto-checkin-notify-ui-on-completion"
            title={t("autoCheckin:settings.notifyUiOnCompletion")}
            description={t("autoCheckin:settings.notifyUiOnCompletionDesc")}
            rightContent={
              <Switch
                checked={preferences.notifyUiOnCompletion}
                onChange={(checked) =>
                  savePreferences({ notifyUiOnCompletion: checked })
                }
                disabled={isSaving}
              />
            }
          />

          {/* Time Window Start */}
          <CardItem
            id="auto-checkin-window-start"
            title={t("autoCheckin:settings.windowStart")}
            description={t("autoCheckin:settings.windowStartDesc")}
            rightContent={
              <Input
                type="time"
                value={inputDrafts.windowStart}
                onChange={(event) =>
                  updateInputDraft("windowStart", event.target.value)
                }
                onBlur={() => void handleWindowStartBlur()}
                onKeyDown={handleInputKeyDown}
                placeholder={DEFAULT_PREFERENCES.autoCheckin?.windowStart}
                disabled={isSaving}
                className="w-32"
              />
            }
          />

          {/* Time Window End */}
          <CardItem
            id="auto-checkin-window-end"
            title={t("autoCheckin:settings.windowEnd")}
            description={t("autoCheckin:settings.windowEndDesc")}
            rightContent={
              <Input
                type="time"
                value={inputDrafts.windowEnd}
                onChange={(event) =>
                  updateInputDraft("windowEnd", event.target.value)
                }
                onBlur={() => void handleWindowEndBlur()}
                onKeyDown={handleInputKeyDown}
                placeholder={DEFAULT_PREFERENCES.autoCheckin?.windowEnd}
                disabled={isSaving}
                className="w-32"
              />
            }
          />

          {/* Schedule Mode */}
          <CardItem
            id="auto-checkin-schedule-mode"
            title={t("autoCheckin:settings.scheduleModeTitle")}
            description={t("autoCheckin:settings.scheduleModeDesc")}
            rightContent={
              <ResponsiveToggleGroup
                aria-label={t("autoCheckin:settings.scheduleModeTitle")}
                value={preferences.scheduleMode}
                onValueChange={(scheduleMode) => {
                  void savePreferences({ scheduleMode })
                }}
                options={scheduleModes.map((mode) => ({
                  value: mode.value,
                  label: mode.label,
                  ariaLabel: mode.label,
                  disabled: isSaving,
                }))}
              />
            }
          />

          {/* Deterministic Time */}
          {preferences.scheduleMode ===
            AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC && (
            <CardItem
              id="auto-checkin-deterministic-time"
              title={t("autoCheckin:settings.deterministicTimeTitle")}
              description={t("autoCheckin:settings.deterministicTimeDesc")}
              rightContent={
                <Input
                  type="time"
                  value={inputDrafts.deterministicTime}
                  onChange={(event) =>
                    updateInputDraft("deterministicTime", event.target.value)
                  }
                  onBlur={() => void handleDeterministicTimeBlur()}
                  onKeyDown={handleInputKeyDown}
                  placeholder={
                    DEFAULT_PREFERENCES.autoCheckin?.deterministicTime
                  }
                  disabled={isSaving}
                  className="w-32"
                />
              }
            />
          )}

          {/* Retry Strategy */}
          <CardItem
            id="auto-checkin-retry-enabled"
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
            id="auto-checkin-retry-interval"
            title={t("autoCheckin:settings.retryInterval")}
            description={t("autoCheckin:settings.retryIntervalDesc")}
            rightContent={
              <Input
                type="number"
                min={1}
                value={inputDrafts.retryIntervalMinutes}
                onChange={(event) =>
                  updateInputDraft("retryIntervalMinutes", event.target.value)
                }
                onBlur={() =>
                  void handleRetryNumberBlur("retryIntervalMinutes")
                }
                onKeyDown={handleInputKeyDown}
                placeholder={String(retryPreferences.intervalMinutes)}
                disabled={isSaving || !retryPreferences.enabled}
                className="w-32"
              />
            }
          />

          <CardItem
            id="auto-checkin-retry-max-attempts"
            title={t("autoCheckin:settings.retryMaxAttempts")}
            description={t("autoCheckin:settings.retryMaxAttemptsDesc")}
            rightContent={
              <Input
                type="number"
                min={1}
                value={inputDrafts.retryMaxAttemptsPerDay}
                onChange={(event) =>
                  updateInputDraft("retryMaxAttemptsPerDay", event.target.value)
                }
                onBlur={() =>
                  void handleRetryNumberBlur("retryMaxAttemptsPerDay")
                }
                onKeyDown={handleInputKeyDown}
                placeholder={String(retryPreferences.maxAttemptsPerDay)}
                disabled={isSaving || !retryPreferences.enabled}
                className="w-32"
              />
            }
          />

          {/* View Execution Button */}
          <CardItem
            id="auto-checkin-view-execution"
            title={t("autoCheckin:settings.viewExecution")}
            description={t("autoCheckin:settings.viewExecutionDesc")}
            rightContent={
              <WorkflowTransitionButton
                onClick={handleNavigateToExecution}
                variant="default"
                size="sm"
                className="flex items-center gap-2"
              >
                <span>{t("autoCheckin:settings.viewExecutionButton")}</span>
              </WorkflowTransitionButton>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
