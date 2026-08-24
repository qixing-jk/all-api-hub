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
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/core/toastHelpers"

/**
 * Unified logger scoped to the Basic Settings redemption assist section.
 */
const logger = createLogger("RedemptionAssistSettings")
const REDEMPTION_ASSIST_SAVE_ACTIONS = {
  ENABLED: "enabled",
  CONTEXT_MENU: "context_menu",
  RELAXED_CODE_VALIDATION: "relaxed_code_validation",
  URL_WHITELIST_ENABLED: "url_whitelist_enabled",
  INCLUDE_ACCOUNT_SITE_URLS: "include_account_site_urls",
  INCLUDE_CHECKIN_REDEEM_URLS: "include_checkin_redeem_urls",
  URL_PATTERNS: "url_patterns",
} as const

type RedemptionAssistSaveAction =
  (typeof REDEMPTION_ASSIST_SAVE_ACTIONS)[keyof typeof REDEMPTION_ASSIST_SAVE_ACTIONS]

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
  const saveActions = useSingleFlightActions<RedemptionAssistSaveAction>()

  const config =
    userPrefs.redemptionAssist ?? DEFAULT_PREFERENCES.redemptionAssist!

  const contextMenu = config.contextMenu ?? {
    enabled: true,
  }

  const whitelist =
    config.urlWhitelist ?? DEFAULT_PREFERENCES.redemptionAssist!.urlWhitelist

  const {
    draft: patternsDraft,
    setDraft: setPatternsDraft,
    acceptDraft: acceptPatternsDraft,
    isDirty: patternsDirty,
  } = usePreferenceDraft({
    savedValue: (whitelist.patterns ?? []).join("\n"),
    savedVersion: userPrefs.lastUpdated ?? 0,
  })

  const saveSettings = (
    action: RedemptionAssistSaveAction,
    updates: Parameters<typeof updateRedemptionAssist>[0],
  ) =>
    saveActions.run(action, async () => {
      try {
        const writeResult = await updateRedemptionAssist(updates)

        if (writeResult.ok) {
          toast.success(t("redemptionAssist:messages.success.settingsSaved"))
          return true
        }
        toast.error(
          getPreferenceWriteFailureMessage(writeResult.reason, {
            fallback: t("settings:messages.saveSettingsFailed"),
          }),
        )
        return false
      } catch (error) {
        const msg = getErrorMessage(error)
        logger.error("Failed to save redemption assist settings", {
          message: msg,
          error,
        })
        toast.error(msg || t("settings:messages.saveSettingsFailed"))
        return false
      }
    })

  const handleSaveUrlPatterns = async () => {
    const nextPatterns = patternsDraft
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const saved = await saveSettings(
      REDEMPTION_ASSIST_SAVE_ACTIONS.URL_PATTERNS,
      {
        urlWhitelist: {
          patterns: nextPatterns,
        },
      },
    )
    if (saved) {
      acceptPatternsDraft(nextPatterns.join("\n"))
    }
  }

  return (
    <SettingSection
      id="redemption-assist"
      title={t("redemptionAssist:settings.title")}
      description={t("redemptionAssist:settings.description")}
      onReset={resetRedemptionAssistConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="redemption-assist-enable"
            title={t("redemptionAssist:settings.enable")}
            description={t("redemptionAssist:settings.enableDesc")}
            rightContent={
              <Switch
                checked={config.enabled}
                onChange={(checked) => {
                  void saveSettings(REDEMPTION_ASSIST_SAVE_ACTIONS.ENABLED, {
                    enabled: checked,
                  })
                }}
                disabled={saveActions.isPending(
                  REDEMPTION_ASSIST_SAVE_ACTIONS.ENABLED,
                )}
              />
            }
          />

          <CardItem
            id="redemption-assist-context-menu-enable"
            title={t("redemptionAssist:settings.contextMenu.enable")}
            description={t("redemptionAssist:settings.contextMenu.enableDesc")}
            rightContent={
              <Switch
                checked={!!contextMenu.enabled}
                onChange={(checked) => {
                  void saveSettings(
                    REDEMPTION_ASSIST_SAVE_ACTIONS.CONTEXT_MENU,
                    {
                      contextMenu: {
                        enabled: checked,
                      },
                    },
                  )
                }}
                disabled={saveActions.isPending(
                  REDEMPTION_ASSIST_SAVE_ACTIONS.CONTEXT_MENU,
                )}
              />
            }
          />

          <CardItem
            id="redemption-assist-relaxed-code-validation"
            title={t("redemptionAssist:settings.relaxedCodeValidation")}
            description={t(
              "redemptionAssist:settings.relaxedCodeValidationDesc",
            )}
            rightContent={
              <Switch
                checked={config.relaxedCodeValidation}
                onChange={(checked) => {
                  void saveSettings(
                    REDEMPTION_ASSIST_SAVE_ACTIONS.RELAXED_CODE_VALIDATION,
                    { relaxedCodeValidation: checked },
                  )
                }}
                disabled={saveActions.isPending(
                  REDEMPTION_ASSIST_SAVE_ACTIONS.RELAXED_CODE_VALIDATION,
                )}
              />
            }
          />

          <CardItem
            id="redemption-assist-url-whitelist-enable"
            title={t("redemptionAssist:settings.urlWhitelist.enable")}
            description={t("redemptionAssist:settings.urlWhitelist.enableDesc")}
            rightContent={
              <Switch
                checked={whitelist.enabled}
                onChange={(checked) => {
                  void saveSettings(
                    REDEMPTION_ASSIST_SAVE_ACTIONS.URL_WHITELIST_ENABLED,
                    {
                      urlWhitelist: {
                        enabled: checked,
                      },
                    },
                  )
                }}
                disabled={saveActions.isPending(
                  REDEMPTION_ASSIST_SAVE_ACTIONS.URL_WHITELIST_ENABLED,
                )}
              />
            }
          />

          <CardItem
            id="redemption-assist-include-account-site-urls"
            title={t(
              "redemptionAssist:settings.urlWhitelist.includeAccountSiteUrls",
            )}
            description={t(
              "redemptionAssist:settings.urlWhitelist.includeAccountSiteUrlsDesc",
            )}
            rightContent={
              <Switch
                checked={whitelist.includeAccountSiteUrls}
                onChange={(checked) => {
                  void saveSettings(
                    REDEMPTION_ASSIST_SAVE_ACTIONS.INCLUDE_ACCOUNT_SITE_URLS,
                    {
                      urlWhitelist: {
                        includeAccountSiteUrls: checked,
                      },
                    },
                  )
                }}
                disabled={saveActions.isPending(
                  REDEMPTION_ASSIST_SAVE_ACTIONS.INCLUDE_ACCOUNT_SITE_URLS,
                )}
              />
            }
          />

          <CardItem
            id="redemption-assist-include-checkin-redeem-urls"
            title={t(
              "redemptionAssist:settings.urlWhitelist.includeCheckInAndRedeemUrls",
            )}
            description={t(
              "redemptionAssist:settings.urlWhitelist.includeCheckInAndRedeemUrlsDesc",
            )}
            rightContent={
              <Switch
                checked={whitelist.includeCheckInAndRedeemUrls}
                onChange={(checked) => {
                  void saveSettings(
                    REDEMPTION_ASSIST_SAVE_ACTIONS.INCLUDE_CHECKIN_REDEEM_URLS,
                    {
                      urlWhitelist: {
                        includeCheckInAndRedeemUrls: checked,
                      },
                    },
                  )
                }}
                disabled={saveActions.isPending(
                  REDEMPTION_ASSIST_SAVE_ACTIONS.INCLUDE_CHECKIN_REDEEM_URLS,
                )}
              />
            }
          />
        </CardList>

        <CardContent
          id="redemption-assist-url-whitelist-patterns"
          className="border-border dark:border-dark-bg-tertiary border-t"
          spacing="sm"
        >
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {t("redemptionAssist:settings.urlWhitelist.patterns")}
            </div>
            <div className="text-muted-foreground text-xs">
              {t("redemptionAssist:settings.urlWhitelist.patternsDesc")}
            </div>
            <Textarea
              value={patternsDraft}
              onChange={(event) => setPatternsDraft(event.target.value)}
              placeholder={t(
                "redemptionAssist:settings.urlWhitelist.patternsPlaceholder",
              )}
              rows={6}
              disabled={saveActions.isPending(
                REDEMPTION_ASSIST_SAVE_ACTIONS.URL_PATTERNS,
              )}
            />

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={
                  !patternsDirty ||
                  saveActions.isPending(
                    REDEMPTION_ASSIST_SAVE_ACTIONS.URL_PATTERNS,
                  )
                }
                loading={saveActions.isPending(
                  REDEMPTION_ASSIST_SAVE_ACTIONS.URL_PATTERNS,
                )}
                onClick={() => void handleSaveUrlPatterns()}
              >
                {saveActions.isPending(
                  REDEMPTION_ASSIST_SAVE_ACTIONS.URL_PATTERNS,
                )
                  ? t("common:status.saving")
                  : t("common:actions.save")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
