import { useTranslation } from "react-i18next"

import ManagedSiteTypeSwitcher from "~/components/ManagedSiteTypeSwitcher"
import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList } from "~/components/ui"

/**
 * Component for selecting which managed site type to use.
 * @returns Section with dropdown to select managed site type.
 */
export default function ManagedSiteSelector() {
  const { t } = useTranslation("settings")

  return (
    <SettingSection
      id="managed-site-selector"
      title={t("managedSite.title")}
      description={t("managedSite.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="managed-site-type"
            title={t("managedSite.siteTypeLabel")}
            description={t("managedSite.siteTypeDesc")}
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
