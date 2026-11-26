import { useTranslation } from "react-i18next"

import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { usePreferenceDraft } from "~/hooks/preferences/usePreferenceDraft"
import { useSingleFlightActions } from "~/hooks/useSingleFlightActions"
import toast from "~/lib/notify"
import { DEFAULT_REDEMPTION_ASSIST_PREFERENCES } from "~/services/preferences/contentScriptFeatureDefaults"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/feedback/preferenceFeedback"
import { matchesDefaultSettings } from "~/utils/preferences/matchesDefaultSettings"

import { RedemptionAssistPatternEditor } from "./RedemptionAssistPatternEditor"

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
  const { t } = useTranslation(["redemptionAssist", "settings"])
  const {
    preferences: userPrefs,
    updateRedemptionAssist,
    resetRedemptionAssistConfig,
  } = useUserPreferencesContext()
  const saveActions = useSingleFlightActions<RedemptionAssistSaveAction>()

  const config =
    userPrefs.redemptionAssist ?? DEFAULT_REDEMPTION_ASSIST_PREFERENCES

  const contextMenu =
    config.contextMenu ?? DEFAULT_REDEMPTION_ASSIST_PREFERENCES.contextMenu

  const whitelist =
    config.urlWhitelist ?? DEFAULT_REDEMPTION_ASSIST_PREFERENCES.urlWhitelist

  const {
    draft: patternsDraft,
    setDraft: setPatternsDraft,
    acceptDraft: acceptPatternsDraft,
    isDirty: patternsDirty,
  } = usePreferenceDraft({
    savedValue: (whitelist.patterns ?? []).join("\n"),
    savedVersion: userPrefs.lastUpdated ?? 0,
  })
  const patternsPending = saveActions.isPending(
    REDEMPTION_ASSIST_SAVE_ACTIONS.URL_PATTERNS,
  )

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
      resetRequiresConfirmation
      resetDisabled={
        patternsPending ||
        (matchesDefaultSettings(
          config,
          DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
        ) &&
          !patternsDirty)
      }
      id="redemption-assist"
      title={t("redemptionAssist:settings.title")}
      description={t("redemptionAssist:settings.description")}
      onReset={async () => {
        const result = await resetRedemptionAssistConfig()
        if (result.ok) {
          acceptPatternsDraft(
            DEFAULT_REDEMPTION_ASSIST_PREFERENCES.urlWhitelist.patterns.join(
              "\n",
            ),
          )
        }
        return result
      }}
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
                aria-label={t("redemptionAssist:settings.enable")}
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
                aria-label={t("redemptionAssist:settings.contextMenu.enable")}
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
                aria-label={t(
                  "redemptionAssist:settings.relaxedCodeValidation",
                )}
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
                aria-label={t("redemptionAssist:settings.urlWhitelist.enable")}
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
                aria-label={t(
                  "redemptionAssist:settings.urlWhitelist.includeAccountSiteUrls",
                )}
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
                aria-label={t(
                  "redemptionAssist:settings.urlWhitelist.includeCheckInAndRedeemUrls",
                )}
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

        <RedemptionAssistPatternEditor
          draft={patternsDraft}
          setDraft={setPatternsDraft}
          dirty={patternsDirty}
          pending={patternsPending}
          onSave={() => void handleSaveUrlPatterns()}
        />
      </Card>
    </SettingSection>
  )
}
