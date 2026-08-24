import { Clock, Megaphone } from "lucide-react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
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
import { useDeferredPreferenceField } from "~/hooks/useDeferredPreferenceField"
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
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_POLLING_INTERVAL_MINUTES ||
    parsed > MAX_POLLING_INTERVAL_MINUTES
  ) {
    return null
  }

  return parsed
}

/**
 * General settings section for provider-site announcement polling.
 */
export default function SiteAnnouncementNotificationSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    siteAnnouncementNotifications,
    updateSiteAnnouncementNotifications,
  } = useUserPreferencesContext()

  const handleToggle = async (enabled: boolean) => {
    const response = await updateSiteAnnouncementNotifications({ enabled })
    showUpdateToast(response, t("siteAnnouncementNotifications.polling.enable"))
  }

  const intervalField = useDeferredPreferenceField({
    savedValue: String(siteAnnouncementNotifications.intervalMinutes),
    savedVersion: preferences?.lastUpdated ?? 0,
    onCommit: async (draft) => {
      const intervalMinutes = normalizePollingIntervalInput(draft)
      if (intervalMinutes == null) {
        toast.error(
          t("siteAnnouncementNotifications.polling.intervalInvalid", {
            min: MIN_POLLING_INTERVAL_MINUTES,
            max: MAX_POLLING_INTERVAL_MINUTES,
          }),
        )
        return { ok: false }
      }
      if (intervalMinutes === siteAnnouncementNotifications.intervalMinutes) {
        return { ok: true, value: String(intervalMinutes) }
      }

      let response = { success: false }
      try {
        response = await updateSiteAnnouncementNotifications({
          intervalMinutes,
        })
      } catch {
        response = { success: false }
      }
      showUpdateToast(
        response,
        t("siteAnnouncementNotifications.polling.interval"),
      )
      return { ok: response.success, value: String(intervalMinutes) }
    },
  })

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
              <Megaphone className="h-5 w-5 text-sky-600 dark:text-sky-400" />
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
            icon={<Clock className="h-5 w-5 text-sky-600 dark:text-sky-400" />}
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
                value={intervalField.draft}
                onChange={(event) => intervalField.setDraft(event.target.value)}
                onBlur={() => void intervalField.commit()}
                onKeyDown={intervalField.handleKeyDown}
                disabled={intervalField.isCommitting}
                containerClassName="w-full sm:w-32"
              />
            }
          />
          <CardItem
            id={SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_PAGE}
            icon={
              <WorkflowTransitionIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
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
