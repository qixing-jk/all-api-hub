import { useTranslation } from "react-i18next"

import { SegmentedControl } from "~/components/SegmentedControl"
import {
  Card,
  CardItem,
  CardList,
  Input,
  Switch,
  WorkflowTransitionButton,
} from "~/components/ui"
import { AutoCheckinRiskHint } from "~/features/AutoCheckin/pretrigger/AutoCheckinRiskHint"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AUTO_CHECKIN_SCHEDULE_MODE } from "~/types/autoCheckin"

import { AUTO_CHECKIN_TARGET_IDS } from "./searchTargets"
import { useAutoCheckinSettingsViewModel } from "./useAutoCheckinSettingsViewModel"

/**
 * Renders automatic check-in preferences with editing owned by the view model.
 */
export default function AutoCheckinSettings() {
  const { t } = useTranslation(["autoCheckin", "settings"])
  const {
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
  } = useAutoCheckinSettingsViewModel()

  return (
    <SettingSection
      resetRequiresConfirmation={false}
      resetDisabled={resetDisabled}
      id={AUTO_CHECKIN_TARGET_IDS.section}
      title={t("autoCheckin:settings.title")}
      titleActions={<AutoCheckinRiskHint />}
      description={t("autoCheckin:settings.enableDesc")}
      onReset={resetSettings}
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
              <SegmentedControl
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
                className="gap-y-density-2 flex items-center gap-x-2"
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
