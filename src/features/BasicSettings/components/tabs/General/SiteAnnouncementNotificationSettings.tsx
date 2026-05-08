import {
  ArrowTopRightOnSquareIcon,
  MegaphoneIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Button, Card, CardItem, CardList, Switch } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation"

/**
 * General settings section for provider-site announcement polling.
 */
export default function SiteAnnouncementNotificationSettings() {
  const { t } = useTranslation("settings")
  const { siteAnnouncementNotifications, updateSiteAnnouncementNotifications } =
    useUserPreferencesContext()

  const handleToggle = async (enabled: boolean) => {
    const success = await updateSiteAnnouncementNotifications({ enabled })
    showUpdateToast(success, t("siteAnnouncementNotifications.polling.enable"))
  }

  return (
    <SettingSection
      id={SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS}
      title={t("siteAnnouncementNotifications.title")}
      description={t("siteAnnouncementNotifications.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id={SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED}
            icon={
              <MegaphoneIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            }
            title={t("siteAnnouncementNotifications.polling.enable")}
            description={t("siteAnnouncementNotifications.polling.enableDesc")}
            rightContent={
              <Switch
                checked={siteAnnouncementNotifications.enabled}
                onChange={handleToggle}
              />
            }
          />
          <CardItem
            id={SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_PAGE}
            icon={
              <ArrowTopRightOnSquareIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            }
            title={t("siteAnnouncementNotifications.page.title")}
            description={t("siteAnnouncementNotifications.page.description", {
              intervalMinutes: siteAnnouncementNotifications.intervalMinutes,
            })}
            rightContent={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void openOrFocusOptionsMenuItem(
                    MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
                  )
                }
              >
                {t("siteAnnouncementNotifications.page.open")}
              </Button>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
