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

export const TASK_NOTIFICATION_CHANNELS = {
  Browser: "browser",
  Telegram: "telegram",
  Webhook: "webhook",
} as const

export type TaskNotificationChannel =
  (typeof TASK_NOTIFICATION_CHANNELS)[keyof typeof TASK_NOTIFICATION_CHANNELS]

export type TaskNotificationTaskPreferences = Record<
  TaskNotificationTask,
  boolean
>

export interface TaskNotificationBrowserChannelPreferences {
  enabled: boolean
}

export interface TaskNotificationTelegramChannelPreferences {
  enabled: boolean
  botToken: string
  chatId: string
}

export interface TaskNotificationWebhookChannelPreferences {
  enabled: boolean
  url: string
}

export interface TaskNotificationChannelPreferences {
  [TASK_NOTIFICATION_CHANNELS.Browser]: TaskNotificationBrowserChannelPreferences
  [TASK_NOTIFICATION_CHANNELS.Telegram]: TaskNotificationTelegramChannelPreferences
  [TASK_NOTIFICATION_CHANNELS.Webhook]: TaskNotificationWebhookChannelPreferences
}

export interface TaskNotificationPreferences {
  enabled: boolean
  tasks: TaskNotificationTaskPreferences
  channels: TaskNotificationChannelPreferences
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

export const DEFAULT_TASK_NOTIFICATION_CHANNEL_PREFERENCES: TaskNotificationChannelPreferences =
  {
    [TASK_NOTIFICATION_CHANNELS.Browser]: {
      enabled: true,
    },
    [TASK_NOTIFICATION_CHANNELS.Telegram]: {
      enabled: false,
      botToken: "",
      chatId: "",
    },
    [TASK_NOTIFICATION_CHANNELS.Webhook]: {
      enabled: false,
      url: "",
    },
  }

export const DEFAULT_TASK_NOTIFICATION_PREFERENCES: TaskNotificationPreferences =
  {
    enabled: true,
    tasks: DEFAULT_TASK_NOTIFICATION_TASK_PREFERENCES,
    channels: DEFAULT_TASK_NOTIFICATION_CHANNEL_PREFERENCES,
  }

/**
 * Backfills channel preferences for stored configurations created before
 * third-party notification channels existed.
 */
export function normalizeTaskNotificationChannels(
  channels?: Partial<TaskNotificationChannelPreferences>,
): TaskNotificationChannelPreferences {
  return {
    [TASK_NOTIFICATION_CHANNELS.Browser]: {
      ...DEFAULT_TASK_NOTIFICATION_CHANNEL_PREFERENCES[
        TASK_NOTIFICATION_CHANNELS.Browser
      ],
      ...(channels?.[TASK_NOTIFICATION_CHANNELS.Browser] ?? {}),
    },
    [TASK_NOTIFICATION_CHANNELS.Telegram]: {
      ...DEFAULT_TASK_NOTIFICATION_CHANNEL_PREFERENCES[
        TASK_NOTIFICATION_CHANNELS.Telegram
      ],
      ...(channels?.[TASK_NOTIFICATION_CHANNELS.Telegram] ?? {}),
    },
    [TASK_NOTIFICATION_CHANNELS.Webhook]: {
      ...DEFAULT_TASK_NOTIFICATION_CHANNEL_PREFERENCES[
        TASK_NOTIFICATION_CHANNELS.Webhook
      ],
      ...(channels?.[TASK_NOTIFICATION_CHANNELS.Webhook] ?? {}),
    },
  }
}

/**
 * Backfills task and channel preferences for older stored preference snapshots.
 */
export function normalizeTaskNotificationPreferences(
  preferences?: Partial<TaskNotificationPreferences>,
): TaskNotificationPreferences {
  return {
    ...DEFAULT_TASK_NOTIFICATION_PREFERENCES,
    ...(preferences ?? {}),
    tasks: {
      ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
      ...(preferences?.tasks ?? {}),
    },
    channels: normalizeTaskNotificationChannels(preferences?.channels),
  }
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
