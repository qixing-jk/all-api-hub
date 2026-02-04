import { useEffect, useMemo, useState } from "react"
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
import {
  DEFAULT_PREFERENCES,
  type WebAiApiCheckPreferences,
} from "~/services/userPreferences"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to the Basic Settings Web AI API Check section.
 */
const logger = createLogger("WebAiApiCheckSettings")

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
 * Settings section for Web AI API Check auto-detect whitelist.
 */
export default function WebAiApiCheckSettings() {
  const { t } = useTranslation(["webAiApiCheck", "settings", "common"])
  const {
    preferences: userPrefs,
    updateWebAiApiCheck,
    resetWebAiApiCheckConfig,
  } = useUserPreferencesContext()

  const [isSaving, setIsSaving] = useState(false)

  const config = userPrefs.webAiApiCheck ?? DEFAULT_PREFERENCES.webAiApiCheck!

  const autoDetect =
    config.autoDetect ?? DEFAULT_PREFERENCES.webAiApiCheck!.autoDetect
  const whitelist =
    autoDetect.urlWhitelist ??
    DEFAULT_PREFERENCES.webAiApiCheck!.autoDetect.urlWhitelist

  const [patternsDraft, setPatternsDraft] = useState(
    (whitelist.patterns ?? []).join("\n"),
  )

  useEffect(() => {
    setPatternsDraft((whitelist.patterns ?? []).join("\n"))
  }, [whitelist.patterns])

  const { patterns, invalid } = useMemo(
    () => validateRegexPatterns(patternsDraft.split(/\r?\n/)),
    [patternsDraft],
  )

  const saveSettings = async (updates: Partial<WebAiApiCheckPreferences>) => {
    try {
      setIsSaving(true)
      const success = await updateWebAiApiCheck(updates)

      if (success) {
        toast.success(t("webAiApiCheck:messages.success.settingsSaved"))
      } else {
        toast.error(t("settings:messages.saveSettingsFailed"))
      }
    } catch (error) {
      logger.error("Failed to save Web AI API Check settings", error)
      toast.error(t("settings:messages.saveSettingsFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SettingSection
      id="web-ai-api-check"
      title={t("webAiApiCheck:settings.title")}
      description={t("webAiApiCheck:settings.description")}
      onReset={async () => {
        const result = await resetWebAiApiCheckConfig()
        if (result) setIsSaving(false)
        return result
      }}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("webAiApiCheck:settings.autoDetect.enable")}
            description={t("webAiApiCheck:settings.autoDetect.enableDesc")}
            rightContent={
              <Switch
                checked={!!autoDetect.enabled}
                onChange={(checked) => {
                  void saveSettings({
                    autoDetect: {
                      ...autoDetect,
                      enabled: checked,
                    },
                  })
                }}
                disabled={isSaving}
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
              value={patternsDraft}
              onChange={(event) => setPatternsDraft(event.target.value)}
              placeholder={t(
                "webAiApiCheck:settings.autoDetect.whitelist.patternsPlaceholder",
              )}
              rows={6}
              disabled={isSaving}
            />

            {invalid.length > 0 ? (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
                <div className="font-medium">
                  {t(
                    "webAiApiCheck:settings.autoDetect.whitelist.invalidTitle",
                  )}
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {invalid.slice(0, 10).map((pattern) => (
                    <li key={pattern}>
                      <code className="font-mono">{pattern}</code>
                    </li>
                  ))}
                </ul>
                {invalid.length > 10 ? (
                  <div className="mt-1">
                    {t(
                      "webAiApiCheck:settings.autoDetect.whitelist.invalidMore",
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => {
                  void saveSettings({
                    autoDetect: {
                      ...autoDetect,
                      urlWhitelist: {
                        ...whitelist,
                        patterns,
                      },
                    },
                  })
                }}
              >
                {t("common:actions.save")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
