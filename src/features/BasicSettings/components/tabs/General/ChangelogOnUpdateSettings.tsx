import { FileText } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

/**
 * Settings section that controls whether the extension shows the inline update log
 * the first time the user opens the extension UI after updates.
 */
export default function ChangelogOnUpdateSettings() {
  const { t } = useTranslation("settings")
  const { openChangelogOnUpdate, updateOpenChangelogOnUpdate } =
    useUserPreferencesContext()

  const handleToggle = async (enabled: boolean) => {
    const writeResult = await updateOpenChangelogOnUpdate(enabled)
    showUpdateToast(writeResult, t("changelogOnUpdate.toggleLabel"))
  }

  return (
    <SettingSection
      onReset={() =>
        updateOpenChangelogOnUpdate(DEFAULT_PREFERENCES.openChangelogOnUpdate!)
      }
      resetDisabled={
        openChangelogOnUpdate === DEFAULT_PREFERENCES.openChangelogOnUpdate
      }
      resetRequiresConfirmation={false}
      id="changelog-on-update"
      title={t("changelogOnUpdate.title")}
      description={t("changelogOnUpdate.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="changelog-on-update-toggle"
            icon={
              <FileText className="text-theme-600 dark:text-theme-400 h-5 w-5" />
            }
            title={t("changelogOnUpdate.toggleLabel")}
            description={t("changelogOnUpdate.toggleDesc")}
            rightContent={
              <Switch checked={openChangelogOnUpdate} onChange={handleToggle} />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
