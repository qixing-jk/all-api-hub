import iconUrl from "~/assets/icon.png"
import type {
  TaskNotificationContent,
  TaskNotificationPayload,
} from "~/services/notifications/taskNotificationContracts"
import {
  hasPermission,
  OPTIONAL_PERMISSION_IDS,
} from "~/services/permissions/permissionManager"
import { getTaskNotificationId } from "~/types/taskNotifications"
import {
  createNotification,
  hasNotificationsAPI,
} from "~/utils/browser/notifications"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("TaskNotificationService")

/** Sends a browser system notification after checking permission. */
export async function sendBrowserNotification(
  payload: TaskNotificationPayload,
  content: TaskNotificationContent,
): Promise<boolean> {
  if (!hasNotificationsAPI()) {
    logger.warn("Task notification skipped: notifications API unavailable", {
      task: payload.task,
      status: payload.status,
    })
    return false
  }

  const granted = await hasPermission(OPTIONAL_PERMISSION_IDS.Notifications)
  if (!granted) {
    logger.debug("Task notification skipped: permission not granted", {
      task: payload.task,
      status: payload.status,
    })
    return false
  }

  const createdId = await createNotification(
    getTaskNotificationId(payload.task),
    {
      type: "basic",
      iconUrl,
      title: content.title,
      message: content.message,
      isClickable: true,
    },
  )

  return createdId !== null
}
