import { useEffect, useState } from "react"
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
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to the Basic Settings redemption assist section.
 */
const logger = createLogger("RedemptionAssistSettings")

/**
 * Settings section for toggling redemption assist feature.
 */
export default function RedemptionAssistSettings() {
  const { t } = useTranslation(["redemptionAssist", "settings", "common"])
  const {
    preferences: userPrefs,
    updateRedemptionAssist,
    resetRedemptionAssistConfig,
  } = useUserPreferencesContext()
  const [isSaving, setIsSaving] = useState(false)

  const config =
    userPrefs.redemptionAssist ?? DEFAULT_PREFERENCES.redemptionAssist!

  const whitelist =
    config.urlWhitelist ?? DEFAULT_PREFERENCES.redemptionAssist!.urlWhitelist

  const [patternsDraft, setPatternsDraft] = useState(
    (whitelist.patterns ?? []).join("\n"),
  )

  useEffect(() => {
    setPatternsDraft((whitelist.patterns ?? []).join("\n"))
  }, [whitelist.patterns])

  const saveSettings = async (
    updates: Parameters<typeof updateRedemptionAssist>[0],
  ) => {
    try {
      setIsSaving(true)
      const success = await updateRedemptionAssist(updates)

      if (success) {
        toast.success(
          t("redemptionAssist:messages.success.settingsSaved", {
            defaultValue: "Redemption assist settings have been saved.",
          }),
        )
      } else {
        toast.error(
          t("settings:messages.saveSettingsFailed", {
            defaultValue: "Failed to save settings",
          }),
        )
      }
    } catch (error) {
      logger.error("Failed to save redemption assist settings", error)
      toast.error(
        t("settings:messages.saveSettingsFailed", {
          defaultValue: "Failed to save settings",
        }),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SettingSection
      id="redemption-assist"
      title={t("redemptionAssist:settings.title")}
      description={t("redemptionAssist:settings.description")}
      onReset={async () => {
        const result = await resetRedemptionAssistConfig()
        if (result) {
          setIsSaving(false)
        }
        return result
      }}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("redemptionAssist:settings.enable")}
            description={t("redemptionAssist:settings.enableDesc")}
            rightContent={
              <Switch
                checked={config.enabled}
                onChange={(checked) => {
                  void saveSettings({ enabled: checked })
                }}
                disabled={isSaving}
              />
            }
          />

          <CardItem
            title={t("redemptionAssist:settings.relaxedCodeValidation", {
              defaultValue: "Relax code format restrictions",
            })}
            description={t(
              "redemptionAssist:settings.relaxedCodeValidationDesc",
              {
                defaultValue:
                  "When enabled, any 32-character code will be treated as a possible redemption code (no charset check).",
              },
            )}
            rightContent={
              <Switch
                checked={config.relaxedCodeValidation}
                onChange={(checked) => {
                  void saveSettings({ relaxedCodeValidation: checked })
                }}
                disabled={isSaving}
              />
            }
          />

          <CardItem
            title={t("redemptionAssist:settings.urlWhitelist.enable", {
              defaultValue: "Enable URL whitelist",
            })}
            description={t(
              "redemptionAssist:settings.urlWhitelist.enableDesc",
              {
                defaultValue:
                  "When enabled, redemption assist only runs on URLs allowed by the rules below.",
              },
            )}
            rightContent={
              <Switch
                checked={whitelist.enabled}
                onChange={(checked) => {
                  void saveSettings({
                    urlWhitelist: {
                      ...whitelist,
                      enabled: checked,
                    },
                  })
                }}
                disabled={isSaving}
              />
            }
          />

          <CardItem
            title={t(
              "redemptionAssist:settings.urlWhitelist.includeAccountSiteUrls",
              {
                defaultValue: "Include account site URLs",
              },
            )}
            description={t(
              "redemptionAssist:settings.urlWhitelist.includeAccountSiteUrlsDesc",
              {
                defaultValue:
                  "Allow all pages under each account's site URL origin.",
              },
            )}
            rightContent={
              <Switch
                checked={whitelist.includeAccountSiteUrls}
                onChange={(checked) => {
                  void saveSettings({
                    urlWhitelist: {
                      ...whitelist,
                      includeAccountSiteUrls: checked,
                    },
                  })
                }}
                disabled={isSaving}
              />
            }
          />

          <CardItem
            title={t(
              "redemptionAssist:settings.urlWhitelist.includeCheckInAndRedeemUrls",
              {
                defaultValue: "Include check-in & redeem URLs",
              },
            )}
            description={t(
              "redemptionAssist:settings.urlWhitelist.includeCheckInAndRedeemUrlsDesc",
              {
                defaultValue:
                  "Allow the check-in and redeem pages (custom or default) for each account.",
              },
            )}
            rightContent={
              <Switch
                checked={whitelist.includeCheckInAndRedeemUrls}
                onChange={(checked) => {
                  void saveSettings({
                    urlWhitelist: {
                      ...whitelist,
                      includeCheckInAndRedeemUrls: checked,
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
              {t("redemptionAssist:settings.urlWhitelist.patterns", {
                defaultValue: "Custom regex patterns",
              })}
            </div>
            <div className="text-muted-foreground text-xs">
              {t("redemptionAssist:settings.urlWhitelist.patternsDesc", {
                defaultValue:
                  "One JavaScript RegExp pattern per line. Case-insensitive match is applied.",
              })}
            </div>
            <Textarea
              value={patternsDraft}
              onChange={(event) => setPatternsDraft(event.target.value)}
              placeholder={t(
                "redemptionAssist:settings.urlWhitelist.patternsPlaceholder",
                {
                  defaultValue: "^https://example\\.com/console/topup",
                },
              )}
              rows={6}
              disabled={isSaving}
            />

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => {
                  const nextPatterns = patternsDraft
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                  void saveSettings({
                    urlWhitelist: {
                      ...whitelist,
                      patterns: nextPatterns,
                    },
                  })
                }}
              >
                {t("common:actions.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
