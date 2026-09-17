import { Languages } from "lucide-react"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { BodySmall, Card, CardItem, CardList, Heading3 } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { AppearanceControls } from "~/features/Appearance/AppearanceControls"
import ThemeModeSettings from "~/features/Appearance/ThemeModeSettings"

/**
 * Settings section for theme and interface language preferences.
 */
export default function AppearanceSettings() {
  const { t } = useTranslation("settings")

  return (
    <section
      id={SETTINGS_ANCHORS.APPEARANCE}
      data-slot="setting-section"
      className="space-y-density-6"
    >
      <div data-slot="setting-section-header" className="space-y-density-1-5">
        <Heading3>{t("theme.appearance")}</Heading3>
        <BodySmall>{t("display.description")}</BodySmall>
      </div>
      <fieldset className="space-y-density-6 min-w-0">
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
      </fieldset>
    </section>
  )
}
