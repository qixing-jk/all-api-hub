import { ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/core/toastHelpers"

/**
 * Settings section controlling whether All API Hub prompts for confirmation
 * when adding an account whose site URL already exists (possible duplicate).
 */
export default function DuplicateAccountWarningOnAddSettings() {
  const { t } = useTranslation("settings")
  const { warnOnDuplicateAccountAdd, updateWarnOnDuplicateAccountAdd } =
    useUserPreferencesContext()

  const handleToggle = async (enabled: boolean) => {
    const success = await updateWarnOnDuplicateAccountAdd(enabled)
    showUpdateToast(success, t("duplicateAccountWarningOnAdd.toggleLabel"))
  }

  return (
    <SettingSection
      id="duplicate-account-warning-on-add"
      title={t("duplicateAccountWarningOnAdd.title")}
      description={t("duplicateAccountWarningOnAdd.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            icon={
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            }
            title={t("duplicateAccountWarningOnAdd.toggleLabel")}
            description={t("duplicateAccountWarningOnAdd.toggleDesc")}
            rightContent={
              <Switch
                checked={warnOnDuplicateAccountAdd}
                onChange={handleToggle}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
