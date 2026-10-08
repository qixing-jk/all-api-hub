import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useDeferredPreferenceField } from "~/hooks/useDeferredPreferenceField"
import toast from "~/lib/notify"
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
import { getPreferenceWriteFailureMessage } from "~/utils/feedback/preferenceFeedback"
import { pushWithinOptionsPage } from "~/utils/navigation"
import { matchesDefaultSettings } from "~/utils/preferences/matchesDefaultSettings"

/**
 * Unified logger scoped to the Basic Settings auto check-in section.
 */
const logger = createLogger("AutoCheckinSettings")

const AUTO_CHECKIN_SETTINGS_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

/**
 * Splits an `HH:MM` string into numeric parts, or `null` when a part is missing.
 *
 * Malformed parts stay `NaN` so callers keep their existing validation semantics.
 */
function splitTimeParts(time: string): [number, number] | null {
  const [hour, minute] = time.split(":").map(Number)
  return hour === undefined || minute === undefined ? null : [hour, minute]
}

/**
 * Coordinates saved preferences, deferred drafts, validation, and reset recovery.
 */
export function useAutoCheckinSettingsViewModel() {
  const { t } = useTranslation(["autoCheckin", "settings"])
  const {
    preferences: userPrefs,
    updateAutoCheckin,
    resetAutoCheckinConfig,
  } = useUserPreferencesContext()
  const preferences = userPrefs?.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
  const savedVersion = userPrefs?.lastUpdated ?? 0
  const retryPreferences =
    preferences.retryStrategy ?? DEFAULT_PREFERENCES.autoCheckin!.retryStrategy
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
    }
  }

  const handleNavigateToExecution = () => {
    void trackProductAnalyticsActionStarted({
      ...AUTO_CHECKIN_SETTINGS_ANALYTICS_CONTEXT,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinSettingsPage,
    })
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.AUTO_CHECKIN}`)
  }

  const validateTimeWindow = (start: string, end: string): boolean => {
    const startParts = splitTimeParts(start)
    const endParts = splitTimeParts(end)
    if (!startParts || !endParts) {
      return false
    }
    const [startH, startM] = startParts
    const [endH, endM] = endParts

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
    const parts = splitTimeParts(time)
    if (!parts) {
      return false
    }
    const [hour, minute] = parts
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
    const timeParts = splitTimeParts(time)
    const startParts = splitTimeParts(start)
    const endParts = splitTimeParts(end)
    if (!timeParts || !startParts || !endParts) {
      return false
    }
    const [timeH, timeM] = timeParts
    const [startH, startM] = startParts
    const [endH, endM] = endParts

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

  const windowStartField = useDeferredPreferenceField({
    savedValue: preferences.windowStart,
    savedVersion,
    onCommit: async (nextValue) => {
      if (
        !validateTimeFormat(nextValue) ||
        !validateTimeWindow(nextValue, preferences.windowEnd)
      ) {
        toast.error(t("autoCheckin:messages.error.invalidTimeWindow"))
        return { ok: false }
      }

      const saved = await savePreferences({ windowStart: nextValue })
      return { ok: saved, value: nextValue }
    },
  })

  const windowEndField = useDeferredPreferenceField({
    savedValue: preferences.windowEnd,
    savedVersion,
    onCommit: async (nextValue) => {
      if (
        !validateTimeFormat(nextValue) ||
        !validateTimeWindow(preferences.windowStart, nextValue)
      ) {
        toast.error(t("autoCheckin:messages.error.invalidTimeWindow"))
        return { ok: false }
      }

      const saved = await savePreferences({ windowEnd: nextValue })
      return { ok: saved, value: nextValue }
    },
  })

  const deterministicTimeField = useDeferredPreferenceField({
    savedValue: preferences.deterministicTime ?? preferences.windowStart,
    savedVersion,
    onCommit: async (nextValue) => {
      if (!validateTimeFormat(nextValue)) {
        toast.error(t("autoCheckin:messages.error.invalidDeterministicTime"))
        return { ok: false }
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
        return { ok: false }
      }

      const saved = await savePreferences({ deterministicTime: nextValue })
      return { ok: saved, value: nextValue }
    },
  })

  const commitRetryNumber = async (
    draft: string,
    update: (
      nextValue: number,
    ) => { intervalMinutes: number } | { maxAttemptsPerDay: number },
  ) => {
    const nextValue = Number(draft)
    if (draft.trim() === "" || !Number.isInteger(nextValue) || nextValue <= 0) {
      toast.error(t("autoCheckin:messages.error.invalidNumber"))
      return { ok: false }
    }

    const saved = await saveRetryPreferences(update(nextValue))
    return { ok: saved, value: String(nextValue) }
  }

  const retryIntervalField = useDeferredPreferenceField({
    savedValue: String(retryPreferences.intervalMinutes),
    savedVersion,
    onCommit: (draft) =>
      commitRetryNumber(draft, (intervalMinutes) => ({ intervalMinutes })),
  })

  const retryMaxAttemptsField = useDeferredPreferenceField({
    savedValue: String(retryPreferences.maxAttemptsPerDay),
    savedVersion,
    onCommit: (draft) =>
      commitRetryNumber(draft, (maxAttemptsPerDay) => ({
        maxAttemptsPerDay,
      })),
  })

  const resetDisabled =
    matchesDefaultSettings(preferences, DEFAULT_PREFERENCES.autoCheckin) &&
    ![
      windowStartField,
      windowEndField,
      deterministicTimeField,
      retryIntervalField,
      retryMaxAttemptsField,
    ].some((field) => field.isDirty)

  const resetSettings = async () => {
    const result = await resetAutoCheckinConfig()
    if (result.ok) {
      const defaults = DEFAULT_PREFERENCES.autoCheckin!
      windowStartField.setDraft(defaults.windowStart)
      windowEndField.setDraft(defaults.windowEnd)
      deterministicTimeField.setDraft(
        defaults.deterministicTime ?? defaults.windowStart,
      )
      retryIntervalField.setDraft(
        String(defaults.retryStrategy.intervalMinutes),
      )
      retryMaxAttemptsField.setDraft(
        String(defaults.retryStrategy.maxAttemptsPerDay),
      )
    }
    return result
  }

  return {
    preferences,
    retryPreferences,
    scheduleModes,
    savePreferences,
    saveRetryPreferences,
    windowStartField,
    windowEndField,
    deterministicTimeField,
    retryIntervalField,
    retryMaxAttemptsField,
    resetDisabled,
    resetSettings,
    handleNavigateToExecution,
  }
}
