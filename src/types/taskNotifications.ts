export const TASK_NOTIFICATION_TASKS = {
  AutoCheckin: "autoCheckin",
  WebdavAutoSync: "webdavAutoSync",
  ManagedSiteModelSync: "managedSiteModelSync",
  UsageHistorySync: "usageHistorySync",
  BalanceHistoryCapture: "balanceHistoryCapture",
} as const

export type TaskNotificationTask =
  (typeof TASK_NOTIFICATION_TASKS)[keyof typeof TASK_NOTIFICATION_TASKS]

export type TaskNotificationStatus = "success" | "partial_success" | "failure"

export type TaskNotificationTaskPreferences = Record<
  TaskNotificationTask,
  boolean
>

export interface TaskNotificationPreferences {
  enabled: boolean
  tasks: TaskNotificationTaskPreferences
}

export const DEFAULT_TASK_NOTIFICATION_TASK_PREFERENCES: TaskNotificationTaskPreferences =
  {
    autoCheckin: true,
    webdavAutoSync: true,
    managedSiteModelSync: true,
    usageHistorySync: true,
    balanceHistoryCapture: true,
  }

export const DEFAULT_TASK_NOTIFICATION_PREFERENCES: TaskNotificationPreferences =
  {
    enabled: true,
    tasks: DEFAULT_TASK_NOTIFICATION_TASK_PREFERENCES,
  }
