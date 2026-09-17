import { Languages } from "lucide-react"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { AppearanceControls } from "~/features/Appearance/AppearanceControls"
import ThemeModeSettings from "~/features/Appearance/ThemeModeSettings"

/**
 * Settings section for theme and interface language preferences.
 */
export default function AppearanceSettings() {
  const { t } = useTranslation("settings")

  return (
    <SettingSection
      id={SETTINGS_ANCHORS.APPEARANCE}
      title={t("theme.appearance")}
      description={t("display.description")}
    >
      <Card padding="none">
        <CardList>
          <ThemeModeSettings />
          <CardItem
            id={SETTINGS_ANCHORS.APPEARANCE_LANGUAGE}
            icon={
              <Languages className="text-theme-600 dark:text-theme-400 h-5 w-5" />
            }
            title={t("appearanceLanguage.language")}
            description={t("appearanceLanguage.languageDesc")}
            rightContent={<LanguageSwitcher variant="select" />}
          />
        </CardList>
      </Card>
      <Card padding="md">
        <AppearanceControls anchors />
      </Card>
    </SettingSection>
  )
}
