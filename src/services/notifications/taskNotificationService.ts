import iconUrl from "~/assets/icon.png"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  hasPermission,
  OPTIONAL_PERMISSION_IDS,
} from "~/services/permissions/permissionManager"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  getTaskNotificationId,
  parseTaskNotificationId,
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationStatus,
  type TaskNotificationTask,
} from "~/types/taskNotifications"
import {
  clearNotification,
  createNotification,
  hasNotificationsAPI,
  onNotificationClicked,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation"

const logger = createLogger("TaskNotificationService")

interface TaskNotificationCounts {
  total?: number
  success?: number
  failed?: number
  skipped?: number
}

interface TaskNotificationPayload {
  task: TaskNotificationTask
  status: TaskNotificationStatus
  counts?: TaskNotificationCounts
  message?: string
}

const TASK_LABEL_KEYS: Record<TaskNotificationTask, string> = {
  autoCheckin: "settings:taskNotifications.tasks.autoCheckin",
  webdavAutoSync: "settings:taskNotifications.tasks.webdavAutoSync",
  managedSiteModelSync: "settings:taskNotifications.tasks.managedSiteModelSync",
  usageHistorySync: "settings:taskNotifications.tasks.usageHistorySync",
  balanceHistoryCapture:
    "settings:taskNotifications.tasks.balanceHistoryCapture",
}

const STATUS_TITLE_KEYS: Record<TaskNotificationStatus, string> = {
  success: "settings:taskNotifications.notification.title.success",
  partial_success:
    "settings:taskNotifications.notification.title.partialSuccess",
  failure: "settings:taskNotifications.notification.title.failure",
}

const STATUS_BODY_KEYS: Record<TaskNotificationStatus, string> = {
  success: "settings:taskNotifications.notification.body.success",
  partial_success:
    "settings:taskNotifications.notification.body.partialSuccess",
  failure: "settings:taskNotifications.notification.body.failure",
}

const TASK_NAVIGATION_TARGETS: Record<
  TaskNotificationTask,
  {
    menuItemId: Parameters<typeof openOrFocusOptionsMenuItem>[0]
    searchParams?: Record<string, string | undefined>
  }
> = {
  autoCheckin: {
    menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN,
  },
  webdavAutoSync: {
    menuItemId: MENU_ITEM_IDS.BASIC,
    searchParams: { tab: "dataBackup", anchor: "webdav-auto-sync" },
  },
  managedSiteModelSync: {
    menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
  },
  usageHistorySync: {
    menuItemId: MENU_ITEM_IDS.BASIC,
    searchParams: { tab: "accountUsage" },
  },
  balanceHistoryCapture: {
    menuItemId: MENU_ITEM_IDS.BASIC,
    searchParams: { tab: "balanceHistory" },
  },
}

let unsubscribeNotificationClicked: (() => void) | null = null

/**
 * Formats task execution counts for inclusion in notification copy.
 */
function formatCounts(counts: TaskNotificationCounts | undefined) {
  if (!counts) {
    return null
  }

  const hasAnyCount = Object.values(counts).some(
    (value) => typeof value === "number" && Number.isFinite(value),
  )

  if (!hasAnyCount) {
    return null
  }

  return t("settings:taskNotifications.notification.counts", {
    total: counts.total ?? 0,
    success: counts.success ?? 0,
    failed: counts.failed ?? 0,
    skipped: counts.skipped ?? 0,
  })
}

/**
 * Builds the localized title and message for a task notification payload.
 */
function buildNotificationContent(payload: TaskNotificationPayload) {
  const taskName = t(TASK_LABEL_KEYS[payload.task])
  const title = t(STATUS_TITLE_KEYS[payload.status], { task: taskName })
  const counts = formatCounts(payload.counts)
  const fallbackMessage = t(STATUS_BODY_KEYS[payload.status], {
    task: taskName,
  })
  const message = payload.message?.trim() || fallbackMessage

  return {
    title,
    message: counts ? `${message} ${counts}` : message,
  }
}

/**
 * Checks user preferences and browser capabilities before sending a notification.
 */
async function shouldNotify(
  payload: TaskNotificationPayload,
): Promise<boolean> {
  const prefs = await userPreferences.getPreferences()
  const taskNotifications =
    prefs.taskNotifications ?? DEFAULT_TASK_NOTIFICATION_PREFERENCES

  if (!taskNotifications.enabled || !taskNotifications.tasks[payload.task]) {
    return false
  }

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

  return true
}

/**
 * Sends a best-effort system notification for a scheduled task result.
 *
 * Notification failures are deliberately swallowed so the background task result
 * remains independent from user-facing delivery.
 */
export async function notifyTaskResult(
  payload: TaskNotificationPayload,
): Promise<boolean> {
  try {
    if (!(await shouldNotify(payload))) {
      return false
    }

    const content = buildNotificationContent(payload)
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
  } catch (error) {
    logger.warn("Task notification failed", {
      task: payload.task,
      status: payload.status,
      error: getErrorMessage(error),
    })
    return false
  }
}

/**
 * Handles task-notification clicks by opening the related settings destination.
 */
async function handleNotificationClick(notificationId: string): Promise<void> {
  const task = parseTaskNotificationId(notificationId)
  if (!task) {
    return
  }

  const target = TASK_NAVIGATION_TARGETS[task]
  await openOrFocusOptionsMenuItem(target.menuItemId, target.searchParams)
  await clearNotification(notificationId)
}

/**
 * Registers the notification click listener. Idempotent across background
 * service initialization attempts.
 */
export function initializeTaskNotificationService(): void {
  if (unsubscribeNotificationClicked) {
    return
  }

  unsubscribeNotificationClicked = onNotificationClicked((notificationId) => {
    void handleNotificationClick(notificationId).catch((error) => {
      logger.warn("Failed to handle task notification click", {
        notificationId,
        error: getErrorMessage(error),
      })
    })
  })
}

/**
 * Handles runtime requests that trigger a test task notification.
 */
export async function handleTaskNotificationMessage(
  request: any,
  sendResponse: (response: any) => void,
): Promise<void> {
  if (request.action !== RuntimeActionIds.TaskNotificationsTest) {
    sendResponse({ success: false, error: "Unknown action" })
    return
  }

  const success = await notifyTaskResult({
    task: TASK_NOTIFICATION_TASKS.AutoCheckin,
    status: TASK_NOTIFICATION_STATUSES.Success,
    message: t("settings:taskNotifications.test.message"),
  })

  sendResponse({
    success,
    error: success ? undefined : t("settings:taskNotifications.test.failed"),
  })
}
