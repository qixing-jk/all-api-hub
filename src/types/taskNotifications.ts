export const TASK_NOTIFICATION_TASKS = {
  AutoCheckin: "autoCheckin",
  WebdavAutoSync: "webdavAutoSync",
  ManagedSiteModelSync: "managedSiteModelSync",
  UsageHistorySync: "usageHistorySync",
  BalanceHistoryCapture: "balanceHistoryCapture",
  SiteAnnouncements: "siteAnnouncements",
} as const

export type TaskNotificationTask =
  (typeof TASK_NOTIFICATION_TASKS)[keyof typeof TASK_NOTIFICATION_TASKS]

export const TASK_NOTIFICATION_STATUSES = {
  Success: "success",
  PartialSuccess: "partial_success",
  Failure: "failure",
} as const

export type TaskNotificationStatus =
  (typeof TASK_NOTIFICATION_STATUSES)[keyof typeof TASK_NOTIFICATION_STATUSES]

export type TaskNotificationTaskPreferences = Record<
  TaskNotificationTask,
  boolean
>

export interface TaskNotificationPreferences {
  enabled: boolean
  tasks: TaskNotificationTaskPreferences
}

const TASK_NOTIFICATION_TASK_ORDER = [
  TASK_NOTIFICATION_TASKS.AutoCheckin,
  TASK_NOTIFICATION_TASKS.WebdavAutoSync,
  TASK_NOTIFICATION_TASKS.ManagedSiteModelSync,
  TASK_NOTIFICATION_TASKS.UsageHistorySync,
  TASK_NOTIFICATION_TASKS.BalanceHistoryCapture,
  TASK_NOTIFICATION_TASKS.SiteAnnouncements,
] as const satisfies readonly TaskNotificationTask[]

const TASK_NOTIFICATION_ID_PREFIX = "all-api-hub:task:" as const

const DEFAULT_TASK_NOTIFICATION_TASK_PREFERENCES: TaskNotificationTaskPreferences =
  Object.fromEntries(
    TASK_NOTIFICATION_TASK_ORDER.map((task) => [task, true]),
  ) as TaskNotificationTaskPreferences

export const DEFAULT_TASK_NOTIFICATION_PREFERENCES: TaskNotificationPreferences =
  {
    enabled: true,
    tasks: DEFAULT_TASK_NOTIFICATION_TASK_PREFERENCES,
  }

/**
 * Builds the stable browser notification id for a task notification.
 */
export function getTaskNotificationId(task: TaskNotificationTask): string {
  return `${TASK_NOTIFICATION_ID_PREFIX}${task}`
}

/**
 * Parses a task notification id back into its task key when it matches the known format.
 */
export function parseTaskNotificationId(
  notificationId: string,
): TaskNotificationTask | null {
  if (!notificationId.startsWith(TASK_NOTIFICATION_ID_PREFIX)) {
    return null
  }

  const task = notificationId.slice(TASK_NOTIFICATION_ID_PREFIX.length)
  return TASK_NOTIFICATION_TASK_ORDER.includes(task as TaskNotificationTask)
    ? (task as TaskNotificationTask)
    : null
}

/**
 * Derives an overall notification status from per-run success and failure counts.
 */
export function getTaskNotificationStatusFromCounts(params: {
  successCount: number
  failedCount: number
}): TaskNotificationStatus {
  if (params.failedCount > 0 && params.successCount > 0) {
    return TASK_NOTIFICATION_STATUSES.PartialSuccess
  }

  if (params.failedCount > 0) {
    return TASK_NOTIFICATION_STATUSES.Failure
  }

  return TASK_NOTIFICATION_STATUSES.Success
}
