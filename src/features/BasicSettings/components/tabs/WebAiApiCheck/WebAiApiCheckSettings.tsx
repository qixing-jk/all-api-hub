import { useMemo } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardContent,
  CardItem,
  CardList,
  Switch,
  Textarea,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import { useSingleFlightActions } from "~/hooks/useSingleFlightActions"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { createLogger } from "~/utils/core/logger"
import { isSafeRegexPattern } from "~/utils/core/regex"
import { getPreferenceWriteFailureMessage } from "~/utils/core/toastHelpers"

import { WEB_AI_API_CHECK_TARGET_IDS } from "./searchTargets"

/**
 * Unified logger scoped to the Basic Settings Web AI API Check section.
 */
const logger = createLogger("WebAiApiCheckSettings")
const SETTINGS_SAVE_ACTIONS = {
  CONTEXT_MENU: "context_menu",
  AUTO_DETECT: "auto_detect",
  ENHANCED_AUTO_DETECT: "enhanced_auto_detect",
  URL_PATTERNS: "url_patterns",
  KEY_CLEANUP_PATTERNS: "key_cleanup_patterns",
} as const

type SettingsSaveAction =
  (typeof SETTINGS_SAVE_ACTIONS)[keyof typeof SETTINGS_SAVE_ACTIONS]

/**
 * Parse a newline-separated list of RegExp pattern strings and report invalid items.
 *
 * This mirrors runtime behavior: patterns are compiled with the `i` flag and invalid
 * patterns are treated as non-matching.
 */
function validateRegexPatterns(lines: string[]): {
  patterns: string[]
  invalid: string[]
} {
  const patterns = lines.map((line) => (line ?? "").trim()).filter(Boolean)

  const invalid: string[] = []
  for (const pattern of patterns) {
    try {
      // Match runtime behavior: compile with case-insensitive flag.
      // Invalid patterns are treated as non-matching in runtime gating logic.
      new RegExp(pattern, "i")
    } catch {
      invalid.push(pattern)
    }
  }

  return { patterns, invalid }
}

/**
 * Separate cleanup patterns that are safe to persist from invalid entries.
 */
function validateSafeRegexPatterns(lines: string[]): {
  patterns: string[]
  invalid: string[]
} {
  const result = validateRegexPatterns(lines)
  const unsafe = result.patterns.filter(
    (pattern) =>
      !result.invalid.includes(pattern) && !isSafeRegexPattern(pattern, "i"),
  )
  const invalid = [...result.invalid, ...unsafe]
  const invalidPatterns = new Set(invalid)
  return {
    patterns: result.patterns.filter(
      (pattern) => !invalidPatterns.has(pattern),
    ),
    invalid,
  }
}

/**
 * Renders invalid RegExp patterns in the settings panels.
 */
function RegexPatternWarning({
  invalid,
  title,
  more,
}: {
  invalid: string[]
  title: string
  more: string
}) {
  if (invalid.length === 0) return null

  return (
    <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
      <div className="font-medium">{title}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {invalid.slice(0, 10).map((pattern) => (
          <li key={pattern}>
            <code className="font-mono">{pattern}</code>
          </li>
        ))}
      </ul>
      {invalid.length > 10 ? <div className="mt-1">{more}</div> : null}
    </div>
  )
}

/**
 * Settings section for Web AI API Check auto-detect whitelist.
 */
export default function WebAiApiCheckSettings() {
  const { t } = useTranslation(["webAiApiCheck", "settings", "common"])
  const {
    preferences: userPrefs,
    updateWebAiApiCheck,
    resetWebAiApiCheckConfig,
  } = useUserPreferencesContext()

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
  const whitelist =
    autoDetect.urlWhitelist ??
    DEFAULT_PREFERENCES.webAiApiCheck!.autoDetect.urlWhitelist
  const keyCleanup =
    config.keyCleanup ?? DEFAULT_PREFERENCES.webAiApiCheck!.keyCleanup

  const {
    draft: patternsDraft,
    setDraft: setPatternsDraft,
    acceptDraft: acceptPatternsDraft,
    isDirty: patternsDirty,
  } = usePreferenceDraft({
    savedValue: (whitelist.patterns ?? []).join("\n"),
    savedVersion: userPrefs.lastUpdated ?? 0,
  })
  const {
    draft: keyCleanupPatternsDraft,
    setDraft: setKeyCleanupPatternsDraft,
    acceptDraft: acceptKeyCleanupPatternsDraft,
    isDirty: keyCleanupPatternsDirty,
  } = usePreferenceDraft({
    savedValue: (keyCleanup.removalPatterns ?? []).join("\n"),
    savedVersion: userPrefs.lastUpdated ?? 0,
  })

  const { patterns, invalid } = useMemo(
    () => validateRegexPatterns(patternsDraft.split(/\r?\n/)),
    [patternsDraft],
  )
  const { patterns: keyCleanupPatterns, invalid: invalidKeyCleanupPatterns } =
    useMemo(
      () => validateSafeRegexPatterns(keyCleanupPatternsDraft.split(/\r?\n/)),
      [keyCleanupPatternsDraft],
    )

  const saveSettings = (
    action: SettingsSaveAction,
    updates: Parameters<typeof updateWebAiApiCheck>[0],
  ) =>
    saveActions.run(action, async () => {
      try {
        const writeResult = await updateWebAiApiCheck(updates)

        if (writeResult.ok) {
          toast.success(t("webAiApiCheck:messages.success.settingsSaved"))
          return true
        }
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

  const handleSaveUrlPatterns = async () => {
    const saved = await saveSettings(SETTINGS_SAVE_ACTIONS.URL_PATTERNS, {
      autoDetect: {
        urlWhitelist: {
          patterns,
        },
      },
    })
    if (saved) {
      acceptPatternsDraft(patterns.join("\n"))
    }
  }

  const handleSaveKeyCleanupPatterns = async () => {
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
      id="web-ai-api-check"
      title={t("webAiApiCheck:settings.title")}
      description={t("webAiApiCheck:settings.description")}
      onReset={resetWebAiApiCheckConfig}
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

        <CardContent
          className="border-border dark:border-dark-bg-tertiary border-t"
          spacing="sm"
        >
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {t("webAiApiCheck:settings.autoDetect.whitelist.patterns")}
            </div>
            <div className="text-muted-foreground text-xs">
              {t("webAiApiCheck:settings.autoDetect.whitelist.patternsDesc")}
            </div>

            <Textarea
              id={WEB_AI_API_CHECK_TARGET_IDS.whitelistPatterns}
              value={patternsDraft}
              onChange={(event) => setPatternsDraft(event.target.value)}
              placeholder={t(
                "webAiApiCheck:settings.autoDetect.whitelist.patternsPlaceholder",
              )}
              rows={6}
              disabled={saveActions.isPending(
                SETTINGS_SAVE_ACTIONS.URL_PATTERNS,
              )}
            />

            <RegexPatternWarning
              invalid={invalid}
              title={t(
                "webAiApiCheck:settings.autoDetect.whitelist.invalidTitle",
              )}
              more={t(
                "webAiApiCheck:settings.autoDetect.whitelist.invalidMore",
              )}
            />

            <div className="flex justify-end">
              <Button
                id={WEB_AI_API_CHECK_TARGET_IDS.savePatterns}
                type="button"
                variant="outline"
                disabled={
                  !patternsDirty ||
                  saveActions.isPending(SETTINGS_SAVE_ACTIONS.URL_PATTERNS)
                }
                loading={saveActions.isPending(
                  SETTINGS_SAVE_ACTIONS.URL_PATTERNS,
                )}
                onClick={() => void handleSaveUrlPatterns()}
              >
                {saveActions.isPending(SETTINGS_SAVE_ACTIONS.URL_PATTERNS)
                  ? t("common:status.saving")
                  : t("common:actions.save")}
              </Button>
            </div>
          </div>
        </CardContent>

        <CardContent
          className="border-border dark:border-dark-bg-tertiary border-t"
          spacing="sm"
        >
          <div className="space-y-2">
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

            <div className="flex justify-end">
              <Button
                id={WEB_AI_API_CHECK_TARGET_IDS.saveKeyCleanupPatterns}
                type="button"
                variant="outline"
                disabled={
                  !keyCleanupPatternsDirty ||
                  saveActions.isPending(
                    SETTINGS_SAVE_ACTIONS.KEY_CLEANUP_PATTERNS,
                  )
                }
                loading={saveActions.isPending(
                  SETTINGS_SAVE_ACTIONS.KEY_CLEANUP_PATTERNS,
                )}
                onClick={() => void handleSaveKeyCleanupPatterns()}
              >
                {saveActions.isPending(
                  SETTINGS_SAVE_ACTIONS.KEY_CLEANUP_PATTERNS,
                )
                  ? t("common:status.saving")
                  : t("webAiApiCheck:settings.keyCleanup.save")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
