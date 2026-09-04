import { useMemo } from "react"
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
import { useDeferredPreferenceField } from "~/hooks/useDeferredPreferenceField"
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

import { AUTO_CHECKIN_TARGET_IDS } from "./searchTargets"

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
  const preferences = userPrefs?.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
  const autoCheckinGlobalEnabled = preferences.globalEnabled !== false
  const savedVersion = userPrefs?.lastUpdated ?? 0
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

  return (
    <SettingSection
      id={AUTO_CHECKIN_TARGET_IDS.section}
      title={t(
        autoCheckinGlobalEnabled
          ? "autoCheckin:settings.title"
          : "autoCheckin:execution.manualTitle",
      )}
      description={t(
        autoCheckinGlobalEnabled
          ? "autoCheckin:description"
          : "autoCheckin:manualDescription",
      )}
      onReset={async () => {
        return resetAutoCheckinConfig()
      }}
    >
      <Card padding="none">
        <CardList>
          {/* Enable Auto Check-in */}
          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.enable}
            title={t("autoCheckin:settings.enable")}
            description={t("autoCheckin:settings.enableDesc")}
            rightContent={
              <Switch
                checked={preferences.globalEnabled}
                onChange={(checked) =>
                  savePreferences({ globalEnabled: checked })
                }
              />
            }
          />

          {/* UI-open daily pre-trigger */}
          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.pretriggerUiOpen}
            title={t("autoCheckin:settings.pretriggerDailyOnUiOpen")}
            description={t("autoCheckin:settings.pretriggerDailyOnUiOpenDesc")}
            rightContent={
              <Switch
                checked={preferences.pretriggerDailyOnUiOpen}
                onChange={(checked) =>
                  savePreferences({ pretriggerDailyOnUiOpen: checked })
                }
              />
            }
          />

          {/* Post-run UI refresh notification */}
          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.notifyUiOnCompletion}
            title={t("autoCheckin:settings.notifyUiOnCompletion")}
            description={t("autoCheckin:settings.notifyUiOnCompletionDesc")}
            rightContent={
              <Switch
                checked={preferences.notifyUiOnCompletion}
                onChange={(checked) =>
                  savePreferences({ notifyUiOnCompletion: checked })
                }
              />
            }
          />

          {/* Time Window Start */}
          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.windowStart}
            title={t("autoCheckin:settings.windowStart")}
            description={t("autoCheckin:settings.windowStartDesc")}
            rightContent={
              <Input
                type="time"
                value={windowStartField.draft}
                onChange={(event) =>
                  windowStartField.setDraft(event.target.value)
                }
                onBlur={() => void windowStartField.commit()}
                onKeyDown={windowStartField.handleKeyDown}
                placeholder={DEFAULT_PREFERENCES.autoCheckin?.windowStart}
                aria-label={t("autoCheckin:settings.windowStart")}
                disabled={windowStartField.isCommitting}
                className="w-32"
              />
            }
          />

          {/* Time Window End */}
          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.windowEnd}
            title={t("autoCheckin:settings.windowEnd")}
            description={t("autoCheckin:settings.windowEndDesc")}
            rightContent={
              <Input
                type="time"
                value={windowEndField.draft}
                onChange={(event) =>
                  windowEndField.setDraft(event.target.value)
                }
                onBlur={() => void windowEndField.commit()}
                onKeyDown={windowEndField.handleKeyDown}
                placeholder={DEFAULT_PREFERENCES.autoCheckin?.windowEnd}
                aria-label={t("autoCheckin:settings.windowEnd")}
                disabled={windowEndField.isCommitting}
                className="w-32"
              />
            }
          />

          {/* Schedule Mode */}
          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.scheduleMode}
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
                }))}
              />
            }
          />

          {/* Deterministic Time */}
          {preferences.scheduleMode ===
            AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC && (
            <CardItem
              id={AUTO_CHECKIN_TARGET_IDS.deterministicTime}
              title={t("autoCheckin:settings.deterministicTimeTitle")}
              description={t("autoCheckin:settings.deterministicTimeDesc")}
              rightContent={
                <Input
                  type="time"
                  value={deterministicTimeField.draft}
                  onChange={(event) =>
                    deterministicTimeField.setDraft(event.target.value)
                  }
                  onBlur={() => void deterministicTimeField.commit()}
                  onKeyDown={deterministicTimeField.handleKeyDown}
                  placeholder={
                    DEFAULT_PREFERENCES.autoCheckin?.deterministicTime
                  }
                  aria-label={t("autoCheckin:settings.deterministicTimeTitle")}
                  disabled={deterministicTimeField.isCommitting}
                  className="w-32"
                />
              }
            />
          )}

          {/* Retry Strategy */}
          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.retryEnabled}
            title={t("autoCheckin:settings.retryTitle")}
            description={t("autoCheckin:settings.retryDesc")}
            rightContent={
              <Switch
                checked={retryPreferences.enabled}
                onChange={(checked) =>
                  saveRetryPreferences({ enabled: checked })
                }
              />
            }
          />

          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.retryInterval}
            title={t("autoCheckin:settings.retryInterval")}
            description={t("autoCheckin:settings.retryIntervalDesc")}
            rightContent={
              <Input
                type="number"
                min={1}
                value={retryIntervalField.draft}
                onChange={(event) =>
                  retryIntervalField.setDraft(event.target.value)
                }
                onBlur={() => void retryIntervalField.commit()}
                onKeyDown={retryIntervalField.handleKeyDown}
                placeholder={String(retryPreferences.intervalMinutes)}
                aria-label={t("autoCheckin:settings.retryInterval")}
                disabled={
                  retryIntervalField.isCommitting || !retryPreferences.enabled
                }
                className="w-32"
              />
            }
          />

          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.retryMaxAttempts}
            title={t("autoCheckin:settings.retryMaxAttempts")}
            description={t("autoCheckin:settings.retryMaxAttemptsDesc")}
            rightContent={
              <Input
                type="number"
                min={1}
                value={retryMaxAttemptsField.draft}
                onChange={(event) =>
                  retryMaxAttemptsField.setDraft(event.target.value)
                }
                onBlur={() => void retryMaxAttemptsField.commit()}
                onKeyDown={retryMaxAttemptsField.handleKeyDown}
                placeholder={String(retryPreferences.maxAttemptsPerDay)}
                aria-label={t("autoCheckin:settings.retryMaxAttempts")}
                disabled={
                  retryMaxAttemptsField.isCommitting ||
                  !retryPreferences.enabled
                }
                className="w-32"
              />
            }
          />

          {/* View Execution Button */}
          <CardItem
            id={AUTO_CHECKIN_TARGET_IDS.viewExecution}
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
