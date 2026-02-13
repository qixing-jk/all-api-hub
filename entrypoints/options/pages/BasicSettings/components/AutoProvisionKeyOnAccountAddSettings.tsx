import { KeyIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/toastHelpers"

/**
 * Settings section controlling whether a default API key is provisioned
 * automatically after adding an account.
 */
export default function AutoProvisionKeyOnAccountAddSettings() {
  const { t } = useTranslation("settings")
  const { autoProvisionKeyOnAccountAdd, updateAutoProvisionKeyOnAccountAdd } =
    useUserPreferencesContext()

  const handleToggle = async (enabled: boolean) => {
    const success = await updateAutoProvisionKeyOnAccountAdd(enabled)
    showUpdateToast(success, t("autoProvisionKeyOnAccountAdd.toggleLabel"))
  }

  return (
    <SettingSection
      id="auto-provision-key-on-account-add"
      title={t("autoProvisionKeyOnAccountAdd.title")}
      description={t("autoProvisionKeyOnAccountAdd.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            icon={
              <KeyIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            }
            title={t("autoProvisionKeyOnAccountAdd.toggleLabel")}
            description={t("autoProvisionKeyOnAccountAdd.toggleDesc")}
            rightContent={
              <Switch
                checked={autoProvisionKeyOnAccountAdd}
                onChange={handleToggle}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
