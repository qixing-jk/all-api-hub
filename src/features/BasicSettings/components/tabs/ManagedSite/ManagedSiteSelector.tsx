import { useTranslation } from "react-i18next"

import ManagedSiteTypeSwitcher from "~/components/ManagedSiteTypeSwitcher"
import { Card, CardItem, CardList } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

/**
 * Component for selecting which managed site type to use.
 * @returns Section with dropdown to select managed site type.
 */
export default function ManagedSiteSelector() {
  const { managedSiteType, updateManagedSiteType } = useUserPreferencesContext()
  const { t } = useTranslation("settings")

  return (
    <SettingSection
      onReset={() => updateManagedSiteType(DEFAULT_PREFERENCES.managedSiteType)}
      resetDisabled={managedSiteType === DEFAULT_PREFERENCES.managedSiteType}
      resetRequiresConfirmation={false}
      id="managed-site-selector"
      title={t("managedSite.title")}
      description={t("managedSite.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="managed-site-type"
            title={t("managedSite.siteTypeLabel")}
            description={`${t("managedSite.siteTypeDesc")} ${t("managedSite.popularityHint")}`}
            rightContent={
              <ManagedSiteTypeSwitcher
                ariaLabel={t("managedSite.siteTypeLabel")}
                triggerClassName="w-full"
                wrapperClassName="w-full"
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
