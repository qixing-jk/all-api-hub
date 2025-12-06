import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"

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
  const [isSaving, setIsSaving] = useState(false)

  const config =
    userPrefs.redemptionAssist ?? DEFAULT_PREFERENCES.redemptionAssist!

  const saveSettings = async (updates: { enabled: boolean }) => {
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
      console.error("Failed to save redemption assist settings:", error)
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
        </CardList>
      </Card>
    </SettingSection>
  )
}
