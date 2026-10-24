import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardItem,
  CardList,
  Switch,
  Textarea,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { usePreferenceDraft } from "~/hooks/preferences/usePreferenceDraft"
import { useSingleFlightActions } from "~/hooks/useSingleFlightActions"
import toast from "~/lib/notify"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/feedback/preferenceFeedback"
import { matchesDefaultSettings } from "~/utils/preferences/matchesDefaultSettings"

import { validateSafeRegexPatterns } from "./regexPatterns"
import { RegexPatternWarning } from "./RegexPatternWarning"
import { WEB_AI_API_CHECK_TARGET_IDS } from "./searchTargets"
import { WebAiApiCheckSiteAccessSettings } from "./WebAiApiCheckSiteAccessSettings"

/**
 * Unified logger scoped to the Basic Settings Web AI API Check section.
 */
const logger = createLogger("WebAiApiCheckSettings")
const SETTINGS_SAVE_ACTIONS = {
  CONTEXT_MENU: "context_menu",
  AUTO_DETECT: "auto_detect",
  ENHANCED_AUTO_DETECT: "enhanced_auto_detect",
  KEY_CLEANUP_PATTERNS: "key_cleanup_patterns",
} as const

type SettingsSaveAction =
  (typeof SETTINGS_SAVE_ACTIONS)[keyof typeof SETTINGS_SAVE_ACTIONS]

/**
 * Settings for manual entry, automatic detection and typed website rules.
 */
export default function WebAiApiCheckSettings() {
  const { t } = useTranslation(["webAiApiCheck", "settings", "common"])
  const {
    preferences: userPrefs,
    updateWebAiApiCheck,
    resetWebAiApiCheckConfig,
  } = useUserPreferencesContext()

  const [scopeResetKey, setScopeResetKey] = useState(0)
  const saveActions = useSingleFlightActions<SettingsSaveAction>()

  const config = userPrefs.webAiApiCheck ?? DEFAULT_PREFERENCES.webAiApiCheck!

  const contextMenu = config.contextMenu ?? {
    enabled: true,
  }

  const autoDetect =
    config.autoDetect ?? DEFAULT_PREFERENCES.webAiApiCheck!.autoDetect
  const enhancedAutoDetect =
    autoDetect.enhanced ??
    DEFAULT_PREFERENCES.webAiApiCheck!.autoDetect.enhanced
  const keyCleanup =
    config.keyCleanup ?? DEFAULT_PREFERENCES.webAiApiCheck!.keyCleanup

  const {
    draft: keyCleanupPatternsDraft,
    setDraft: setKeyCleanupPatternsDraft,
    acceptDraft: acceptKeyCleanupPatternsDraft,
    isDirty: keyCleanupPatternsDirty,
  } = usePreferenceDraft({
    savedValue: (keyCleanup.removalPatterns ?? []).join("\n"),
    savedVersion: userPrefs.lastUpdated ?? 0,
  })

  const { patterns: keyCleanupPatterns, invalid: invalidKeyCleanupPatterns } =
    useMemo(
      () => validateSafeRegexPatterns(keyCleanupPatternsDraft.split(/\r?\n/)),
      [keyCleanupPatternsDraft],
    )

  /**
   * Immediate controls report only failures: the control itself shows the state,
   * and text fields report only pending or unsaved changes.
   */
  const saveSettings = (
    action: SettingsSaveAction,
    updates: Parameters<typeof updateWebAiApiCheck>[0],
  ) =>
    saveActions.run(action, async () => {
      try {
        const writeResult = await updateWebAiApiCheck(updates)

        if (writeResult.ok) return true
        toast.error(
          getPreferenceWriteFailureMessage(writeResult.reason, {
            fallback: t("settings:messages.saveSettingsFailed"),
          }),
        )
        return false
      } catch (error) {
        logger.error("Failed to save Web AI API Check settings", error)
        toast.error(t("settings:messages.saveSettingsFailed"))
        return false
      }
    })

  const handleSaveKeyCleanupPatterns = async () => {
    if (!keyCleanupPatternsDirty || invalidKeyCleanupPatterns.length) return
    const saved = await saveSettings(
      SETTINGS_SAVE_ACTIONS.KEY_CLEANUP_PATTERNS,
      {
        keyCleanup: {
          removalPatterns: keyCleanupPatterns,
        },
      },
    )
    if (saved) {
      acceptKeyCleanupPatternsDraft(keyCleanupPatterns.join("\n"))
    }
  }

  return (
    <SettingSection
      resetRequiresConfirmation
      resetDisabled={
        matchesDefaultSettings(config, DEFAULT_PREFERENCES.webAiApiCheck) &&
        !keyCleanupPatternsDirty
      }
      id="web-ai-api-check"
      title={t("webAiApiCheck:settings.title")}
      description={t("webAiApiCheck:settings.description")}
      onReset={async () => {
        const result = await resetWebAiApiCheckConfig()
        if (result.ok) {
          setScopeResetKey((value) => value + 1)
          acceptKeyCleanupPatternsDraft(
            (
              DEFAULT_PREFERENCES.webAiApiCheck!.keyCleanup.removalPatterns ??
              []
            ).join("\n"),
          )
        }
        return result
      }}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id={WEB_AI_API_CHECK_TARGET_IDS.contextMenu}
            title={t("webAiApiCheck:settings.contextMenu.enable")}
            description={t("webAiApiCheck:settings.contextMenu.enableDesc")}
            rightContent={
              <Switch
                checked={!!contextMenu.enabled}
                aria-label={t("webAiApiCheck:settings.contextMenu.enable")}
                onChange={(checked) => {
                  void saveSettings(SETTINGS_SAVE_ACTIONS.CONTEXT_MENU, {
                    contextMenu: {
                      enabled: checked,
                    },
                  })
                }}
                disabled={saveActions.isPending(
                  SETTINGS_SAVE_ACTIONS.CONTEXT_MENU,
                )}
              />
            }
          />
          <CardItem
            id={WEB_AI_API_CHECK_TARGET_IDS.autoDetect}
            title={t("webAiApiCheck:settings.autoDetect.enable")}
            description={t("webAiApiCheck:settings.autoDetect.enableDesc")}
            rightContent={
              <Switch
                checked={!!autoDetect.enabled}
                aria-label={t("webAiApiCheck:settings.autoDetect.enable")}
                onChange={(checked) => {
                  void saveSettings(SETTINGS_SAVE_ACTIONS.AUTO_DETECT, {
                    autoDetect: {
                      enabled: checked,
                    },
                  })
                }}
                disabled={saveActions.isPending(
                  SETTINGS_SAVE_ACTIONS.AUTO_DETECT,
                )}
              />
            }
          />
          <CardItem
            id={WEB_AI_API_CHECK_TARGET_IDS.enhancedAutoDetect}
            title={t("webAiApiCheck:settings.autoDetect.enhanced.enable")}
            description={t(
              "webAiApiCheck:settings.autoDetect.enhanced.enableDesc",
            )}
            rightContent={
              <Switch
                checked={!!enhancedAutoDetect.enabled}
                aria-label={t(
                  "webAiApiCheck:settings.autoDetect.enhanced.enable",
                )}
                onChange={(checked) => {
                  void saveSettings(
                    SETTINGS_SAVE_ACTIONS.ENHANCED_AUTO_DETECT,
                    {
                      autoDetect: {
                        enhanced: {
                          enabled: checked,
                        },
                      },
                    },
                  )
                }}
                disabled={
                  saveActions.isPending(
                    SETTINGS_SAVE_ACTIONS.ENHANCED_AUTO_DETECT,
                  ) || !autoDetect.enabled
                }
              />
            }
          />
        </CardList>
        <WebAiApiCheckSiteAccessSettings
          key={scopeResetKey}
          autoDetectEnabled={!!autoDetect.enabled}
        />
        <CardContent className="border-border border-t" spacing="sm">
          <div className="space-y-density-2">
            <div className="text-sm font-medium">
              {t("webAiApiCheck:settings.keyCleanup.patterns")}
            </div>
            <div className="text-muted-foreground text-xs">
              {t("webAiApiCheck:settings.keyCleanup.patternsDesc")}
            </div>

            <Textarea
              id={WEB_AI_API_CHECK_TARGET_IDS.keyCleanupPatterns}
              value={keyCleanupPatternsDraft}
              onChange={(event) =>
                setKeyCleanupPatternsDraft(event.target.value)
              }
              onBlur={() => void handleSaveKeyCleanupPatterns()}
              placeholder={t(
                "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
              )}
              rows={4}
              disabled={saveActions.isPending(
                SETTINGS_SAVE_ACTIONS.KEY_CLEANUP_PATTERNS,
              )}
            />

            <RegexPatternWarning
              invalid={invalidKeyCleanupPatterns}
              title={t("webAiApiCheck:settings.keyCleanup.invalidTitle")}
              more={t("webAiApiCheck:settings.keyCleanup.invalidMore")}
            />

            {saveActions.isPending(
              SETTINGS_SAVE_ACTIONS.KEY_CLEANUP_PATTERNS,
            ) || keyCleanupPatternsDirty ? (
              <p role="status" className="text-muted-foreground text-xs">
                {saveActions.isPending(
                  SETTINGS_SAVE_ACTIONS.KEY_CLEANUP_PATTERNS,
                )
                  ? t("common:status.saving")
                  : t("webAiApiCheck:settings.autoSaveHint")}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
