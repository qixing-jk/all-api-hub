import type {
  TaskNotificationCounts,
  TaskNotificationPayload,
} from "~/services/notifications/taskNotificationContracts"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationStatus,
  type TaskNotificationTask,
} from "~/types/taskNotifications"
import { t } from "~/utils/i18n/core"

const TASK_LABEL_KEYS: Record<TaskNotificationTask, string> = {
  [TASK_NOTIFICATION_TASKS.AutoCheckin]:
    "settings:taskNotifications.tasks.autoCheckin",
  [TASK_NOTIFICATION_TASKS.WebdavAutoSync]:
    "settings:taskNotifications.tasks.webdavAutoSync",
  [TASK_NOTIFICATION_TASKS.ManagedSiteModelSync]:
    "settings:taskNotifications.tasks.managedSiteModelSync",
  [TASK_NOTIFICATION_TASKS.UsageHistorySync]:
    "settings:taskNotifications.tasks.usageHistorySync",
  [TASK_NOTIFICATION_TASKS.BalanceHistoryCapture]:
    "settings:taskNotifications.tasks.balanceHistoryCapture",
  [TASK_NOTIFICATION_TASKS.SiteAnnouncements]:
    "settings:taskNotifications.siteAnnouncements.enable",
}

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

  const values = {
    total: counts.total ?? 0,
    success: counts.success ?? 0,
    failed: counts.failed ?? 0,
    skipped: counts.skipped ?? 0,
  }

  return typeof counts.alreadyChecked === "number" ||
    typeof counts.uncertain === "number"
    ? t(
        "settings:taskNotifications.notification.countsWithAutoCheckinCategories",
        {
          ...values,
          alreadyChecked: counts.alreadyChecked ?? 0,
          uncertain: counts.uncertain ?? 0,
        },
      )
    : t("settings:taskNotifications.notification.counts", values)
}

/**
 * Resolves the localized task label used inside notification copy.
 */
function getTaskLabel(task: TaskNotificationTask): string {
  return t(TASK_LABEL_KEYS[task])
}

/**
 * Resolves the localized notification title for the given status.
 */
function getNotificationTitle(
  status: TaskNotificationStatus,
  taskName: string,
): string {
  switch (status) {
    case TASK_NOTIFICATION_STATUSES.Success:
      return t("settings:taskNotifications.notification.title.success", {
        task: taskName,
      })
    case TASK_NOTIFICATION_STATUSES.PartialSuccess:
      return t("settings:taskNotifications.notification.title.partialSuccess", {
        task: taskName,
      })
    case TASK_NOTIFICATION_STATUSES.Failure:
      return t("settings:taskNotifications.notification.title.failure", {
        task: taskName,
      })
  }
}

/**
 * Resolves the localized fallback body for the given status.
 */
function getNotificationBody(
  status: TaskNotificationStatus,
  taskName: string,
): string {
  switch (status) {
    case TASK_NOTIFICATION_STATUSES.Success:
      return t("settings:taskNotifications.notification.body.success", {
        task: taskName,
      })
    case TASK_NOTIFICATION_STATUSES.PartialSuccess:
      return t("settings:taskNotifications.notification.body.partialSuccess", {
        task: taskName,
      })
    case TASK_NOTIFICATION_STATUSES.Failure:
      return t("settings:taskNotifications.notification.body.failure", {
        task: taskName,
      })
  }
}

/**
 * Builds the localized title and message for a task notification payload.
 */
export function buildNotificationContent(payload: TaskNotificationPayload) {
  const taskName = getTaskLabel(payload.task)
  const title =
    payload.title?.trim() || getNotificationTitle(payload.status, taskName)
  const counts = formatCounts(payload.counts)
  const fallbackMessage = getNotificationBody(payload.status, taskName)
  const message = payload.message?.trim() || fallbackMessage

  return {
    title,
    message: counts ? `${message} ${counts}` : message,
  }
}
