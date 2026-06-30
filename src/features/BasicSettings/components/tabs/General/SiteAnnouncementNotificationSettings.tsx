import {
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  MegaphoneIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardItem,
  CardList,
  Input,
  Switch,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation"

const MIN_POLLING_INTERVAL_MINUTES = 15
const MAX_POLLING_INTERVAL_MINUTES = 24 * 60

/**
 * Normalizes user-entered announcement polling minutes to the supported range.
 */
export function normalizePollingIntervalInput(value: string): number | null {
  if (value.trim() === "") {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.min(
    MAX_POLLING_INTERVAL_MINUTES,
    Math.max(MIN_POLLING_INTERVAL_MINUTES, Math.trunc(parsed)),
  )
}

/**
 * General settings section for provider-site announcement polling.
 */
export default function SiteAnnouncementNotificationSettings() {
  const { t } = useTranslation("settings")
  const { siteAnnouncementNotifications, updateSiteAnnouncementNotifications } =
    useUserPreferencesContext()
  const [intervalInput, setIntervalInput] = useState(
    String(siteAnnouncementNotifications.intervalMinutes),
  )

  useEffect(() => {
    setIntervalInput(String(siteAnnouncementNotifications.intervalMinutes))
  }, [siteAnnouncementNotifications.intervalMinutes])

  const handleToggle = async (enabled: boolean) => {
    const response = await updateSiteAnnouncementNotifications({ enabled })
    showUpdateToast(response, t("siteAnnouncementNotifications.polling.enable"))
  }

  const handleIntervalBlur = async () => {
    const intervalMinutes = normalizePollingIntervalInput(intervalInput)
    if (intervalMinutes == null) {
      setIntervalInput(String(siteAnnouncementNotifications.intervalMinutes))
      return
    }

    setIntervalInput(String(intervalMinutes))
    if (intervalMinutes === siteAnnouncementNotifications.intervalMinutes) {
      return
    }

    let response = { success: false }
    try {
      response = await updateSiteAnnouncementNotifications({
        intervalMinutes,
      })
    } catch {
      response = { success: false }
    }
    if (!response.success) {
      setIntervalInput(String(siteAnnouncementNotifications.intervalMinutes))
    }
    showUpdateToast(
      response,
      t("siteAnnouncementNotifications.polling.interval"),
    )
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
            id={SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_INTERVAL}
            icon={
              <ClockIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            }
            title={t("siteAnnouncementNotifications.polling.interval")}
            description={t(
              "siteAnnouncementNotifications.polling.intervalDesc",
            )}
            rightContent={
              <Input
                aria-label={t("siteAnnouncementNotifications.polling.interval")}
                type="number"
                min={MIN_POLLING_INTERVAL_MINUTES}
                max={MAX_POLLING_INTERVAL_MINUTES}
                step={1}
                value={intervalInput}
                onChange={(event) => setIntervalInput(event.target.value)}
                onBlur={() => void handleIntervalBlur()}
                containerClassName="w-full sm:w-32"
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
