import { DocumentTextIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/toastHelpers"

/**
 * Settings section that controls whether the extension opens the docs changelog
 * page automatically after extension updates.
 */
export default function ChangelogOnUpdateSettings() {
  const { t } = useTranslation("settings")
  const { openChangelogOnUpdate, updateOpenChangelogOnUpdate } =
    useUserPreferencesContext()

  const handleToggle = async (enabled: boolean) => {
    const success = await updateOpenChangelogOnUpdate(enabled)
    showUpdateToast(success, t("changelogOnUpdate.toggleLabel"))
  }

  return (
    <SettingSection
      id="changelog-on-update"
      title={t("changelogOnUpdate.title")}
      description={t("changelogOnUpdate.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            icon={
              <DocumentTextIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
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
