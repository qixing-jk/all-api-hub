import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"
import { normalizeSiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import {
  buildAnnouncementDisplayText,
  buildAnnouncementShortTitle,
  buildAnnouncementTitle,
} from "./text"

const logger = createLogger("SiteAnnouncementNotificationService")

/**
 * Checks the site-announcement specific notification preference before routing
 * delivery through the shared task notification service.
 */
async function shouldNotifySiteAnnouncements(): Promise<boolean> {
  const prefs = await userPreferences.getPreferences()
  const siteAnnouncements = normalizeSiteAnnouncementPreferences(
    prefs.siteAnnouncementNotifications,
  )

  return siteAnnouncements.notificationEnabled
}

/**
 * Builds localized notification copy for newly fetched announcements.
 */
function buildNotificationContent(records: SiteAnnouncementRecord[]) {
  const latest = records[0]
  if (!latest) {
    return null
  }

  const site = latest.siteName || latest.baseUrl

  return {
    title: t("siteAnnouncements:notification.title", { site }),
    message:
      records.length > 1
        ? t("siteAnnouncements:notification.multipleUnread", {
            title: buildAnnouncementShortTitle(latest),
            count: records.length - 1,
          })
        : buildAnnouncementDisplayText(latest).preview ||
          buildAnnouncementTitle(latest),
  }
}

/**
 * Sends a best-effort shared task notification for newly discovered site announcements.
 */
export async function notifySiteAnnouncements(
  records: SiteAnnouncementRecord[],
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    if (records.length === 0 || !(await shouldNotifySiteAnnouncements())) {
      return { success: false }
    }

    const content = buildNotificationContent(records)
    if (!content) {
      return { success: false }
    }

    const success = await notifyTaskResult({
      task: TASK_NOTIFICATION_TASKS.SiteAnnouncements,
      status: TASK_NOTIFICATION_STATUSES.Success,
      title: content.title,
      message: content.message,
    })

    return { success }
  } catch (error) {
    const message = getErrorMessage(error)
    logger.warn("Site announcement notification failed", { error: message })
    return { success: false, error: message }
  }
}
