import { GlobeAltIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/core/toastHelpers"

/**
 * Settings section controlling whether the add-account dialog prefills the
 * site URL from the current browser tab.
 */
export default function AutoFillCurrentSiteUrlOnAccountAddSettings() {
  const { t } = useTranslation("settings")
  const {
    autoFillCurrentSiteUrlOnAccountAdd,
    updateAutoFillCurrentSiteUrlOnAccountAdd,
  } = useUserPreferencesContext()

  const handleToggle = async (enabled: boolean) => {
    const success = await updateAutoFillCurrentSiteUrlOnAccountAdd(enabled)
    showUpdateToast(
      success,
      t("autoFillCurrentSiteUrlOnAccountAdd.toggleLabel"),
    )
  }

  return (
    <SettingSection
      id="auto-fill-current-site-url-on-account-add"
      title={t("autoFillCurrentSiteUrlOnAccountAdd.title")}
      description={t("autoFillCurrentSiteUrlOnAccountAdd.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            icon={
              <GlobeAltIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            }
            title={t("autoFillCurrentSiteUrlOnAccountAdd.toggleLabel")}
            description={t("autoFillCurrentSiteUrlOnAccountAdd.toggleDesc")}
            rightContent={
              <Switch
                checked={autoFillCurrentSiteUrlOnAccountAdd}
                onChange={handleToggle}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
