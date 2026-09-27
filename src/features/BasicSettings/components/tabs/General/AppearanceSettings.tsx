import { useTranslation } from "react-i18next"

import { Card, CardList } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { DEFAULT_THEME_MODE } from "~/constants/theme"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { AppearanceControls } from "~/features/Appearance/AppearanceControls"
import ThemeModeSettings from "~/features/Appearance/ThemeModeSettings"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import {
  DEFAULT_APPEARANCE,
  isDefaultAppearance,
  normalizeAppearance,
} from "~/types/theme"

/**
 * Settings section for theme and typography preferences. Interface language is
 * an interface preference rather than a theme one, so it lives in Display
 * Settings.
 */
export default function AppearanceSettings() {
  const { t } = useTranslation("settings")
  const { preferences, themeMode, updateAppearance } =
    useUserPreferencesContext()
  const appearance = normalizeAppearance(preferences?.appearance)

  return (
    <SettingSection
      id={SETTINGS_ANCHORS.APPEARANCE}
      title={t("theme.appearance")}
      description={t("appearance.description")}
      onReset={() =>
        updateAppearance({
          ...DEFAULT_APPEARANCE,
          themeMode: DEFAULT_THEME_MODE,
        })
      }
      resetRequiresConfirmation={false}
      resetDisabled={isDefaultAppearance(appearance, themeMode)}
    >
      <Card padding="none">
        <CardList>
          <ThemeModeSettings />
          <div className="sm:py-density-4 py-density-3 px-4 sm:px-6">
            <AppearanceControls anchors showReset={false} />
          </div>
        </CardList>
      </Card>
    </SettingSection>
  )
}
