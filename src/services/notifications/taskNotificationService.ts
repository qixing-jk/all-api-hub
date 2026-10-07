import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { sendBrowserNotification } from "~/services/notifications/delivery/browser"
import { sendDingtalkNotification } from "~/services/notifications/delivery/dingtalk"
import { sendFeishuNotification } from "~/services/notifications/delivery/feishu"
import { sendNtfyNotification } from "~/services/notifications/delivery/ntfy"
import { sendTelegramNotification } from "~/services/notifications/delivery/telegram"
import { sendWebhookNotification } from "~/services/notifications/delivery/webhook"
import { sendWecomNotification } from "~/services/notifications/delivery/wecom"
import {
  onTaskNotificationMessage,
  TaskNotificationMessageTypes,
  type TaskNotificationTestRequest,
  type TaskNotificationTestResponse,
} from "~/services/notifications/messaging"
import { buildNotificationContent } from "~/services/notifications/taskNotificationContent"
import type {
  TaskNotificationContent,
  TaskNotificationDeliveryOptions,
  TaskNotificationPayload,
} from "~/services/notifications/taskNotificationContracts"
import { userPreferences } from "~/services/preferences/userPreferences"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import {
  DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  normalizeTaskNotificationPreferences,
  parseTaskNotificationId,
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationChannel,
  type TaskNotificationPreferences,
  type TaskNotificationTask,
} from "~/types/taskNotifications"
import {
  clearNotification,
  onNotificationClicked,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation"

const logger = createLogger("TaskNotificationService")

const TASK_NAVIGATION_TARGETS: Record<
  TaskNotificationTask,
  {
    menuItemId: Parameters<typeof openOrFocusOptionsMenuItem>[0]
    searchParams?: Record<string, string | undefined>
  }
> = {
  [TASK_NOTIFICATION_TASKS.AutoCheckin]: {
    menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN,
  },
  [TASK_NOTIFICATION_TASKS.WebdavAutoSync]: {
    menuItemId: MENU_ITEM_IDS.BASIC,
    searchParams: {
      tab: BASIC_SETTINGS_TAB_IDS.DataBackup,
      anchor: SETTINGS_ANCHORS.WEBDAV_AUTO_SYNC,
    },
  },
  [TASK_NOTIFICATION_TASKS.ManagedSiteModelSync]: {
    menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
  },
  [TASK_NOTIFICATION_TASKS.UsageHistorySync]: {
    menuItemId: MENU_ITEM_IDS.BASIC,
    searchParams: { tab: BASIC_SETTINGS_TAB_IDS.AccountUsage },
  },
  [TASK_NOTIFICATION_TASKS.BalanceHistoryCapture]: {
    menuItemId: MENU_ITEM_IDS.BASIC,
    searchParams: { tab: BASIC_SETTINGS_TAB_IDS.BalanceHistory },
  },
  [TASK_NOTIFICATION_TASKS.SiteAnnouncements]: {
    menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
  },
}

let unsubscribeNotificationClicked: (() => void) | null = null

/**
 * Checks user preferences before sending through any configured channel.
 */
function isTaskNotificationEnabled(
  payload: TaskNotificationPayload,
  taskNotifications: TaskNotificationPreferences,
  options: Pick<TaskNotificationDeliveryOptions, "ignoreTaskPreference"> = {},
): boolean {
  if (!taskNotifications.enabled) {
    return false
  }

  if (options.ignoreTaskPreference) {
    return true
  }

  const taskEnabled =
    taskNotifications.tasks[payload.task] ??
    DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks[payload.task]

  if (!taskEnabled) {
    return false
  }

  return true
}

/** Delivers selected channels in order with isolated network failures. */
async function sendConfiguredChannels(
  payload: TaskNotificationPayload,
  content: TaskNotificationContent,
  taskNotifications: TaskNotificationPreferences,
  options: TaskNotificationDeliveryOptions = {},
): Promise<boolean> {
  const deliveryResults: boolean[] = []
  const channels = taskNotifications.channels
  const requestedChannels = options.channels
  const isSingleChannelTest = options.surfaceErrors && requestedChannels
  const shouldSendChannel = (channel: TaskNotificationChannel) =>
    !requestedChannels || requestedChannels.includes(channel)
  const handleChannelFailure = (
    channel: TaskNotificationChannel,
    error: unknown,
  ) => {
    logger.warn(`${channel} task notification failed`, {
      task: payload.task,
      status: payload.status,
      error: getErrorMessage(error),
    })
    if (options.surfaceErrors) {
      throw error
    }
    deliveryResults.push(false)
  }

  if (
    shouldSendChannel(TASK_NOTIFICATION_CHANNELS.Browser) &&
    channels[TASK_NOTIFICATION_CHANNELS.Browser].enabled
  ) {
    const delivered = await sendBrowserNotification(payload, content)
    if (!delivered && options.surfaceErrors) {
      throw new Error(t("settings:taskNotifications.test.browserFailed"))
    }
    deliveryResults.push(delivered)
  }

  // Keep delivery sequential and isolate each network channel's failure.
  const networkDeliveries: Array<{
    channel: TaskNotificationChannel
    send: () => Promise<boolean>
  }> = [
    {
      channel: TASK_NOTIFICATION_CHANNELS.Telegram,
      send: () =>
        sendTelegramNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Telegram],
        ),
    },
    {
      channel: TASK_NOTIFICATION_CHANNELS.Feishu,
      send: () =>
        sendFeishuNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Feishu],
        ),
    },
    {
      channel: TASK_NOTIFICATION_CHANNELS.Dingtalk,
      send: () =>
        sendDingtalkNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Dingtalk],
        ),
    },
    {
      channel: TASK_NOTIFICATION_CHANNELS.Wecom,
      send: () =>
        sendWecomNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Wecom],
        ),
    },
    {
      channel: TASK_NOTIFICATION_CHANNELS.Ntfy,
      send: () =>
        sendNtfyNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Ntfy],
        ),
    },
    {
      channel: TASK_NOTIFICATION_CHANNELS.Webhook,
      send: () =>
        sendWebhookNotification(
          payload,
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Webhook],
        ),
    },
  ]
  for (const { channel, send } of networkDeliveries) {
    if (!shouldSendChannel(channel) || !channels[channel].enabled) continue
    try {
      deliveryResults.push(await send())
    } catch (error) {
      handleChannelFailure(channel, error)
    }
  }

  if (isSingleChannelTest && deliveryResults.length === 0) {
    throw new Error(t("settings:taskNotifications.test.channelDisabled"))
  }

  return deliveryResults.some(Boolean)
}

/**
 * Sends a best-effort notification for a scheduled task result.
 *
 * Notification failures are deliberately swallowed so the background task result
 * remains independent from user-facing delivery.
 */
export async function notifyTaskResult(
  payload: TaskNotificationPayload,
  options?: TaskNotificationDeliveryOptions,
): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    const taskNotifications = normalizeTaskNotificationPreferences(
      prefs.taskNotifications,
    )

    if (!isTaskNotificationEnabled(payload, taskNotifications, options)) {
      return false
    }

    const content = buildNotificationContent(payload)
    return await sendConfiguredChannels(
      payload,
      content,
      taskNotifications,
      options,
    )
  } catch (error) {
    logger.warn("Task notification failed", {
      task: payload.task,
      status: payload.status,
      error: getErrorMessage(error),
    })
    if (options?.surfaceErrors) {
      throw error
    }
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
 * Test-only reset for the module-scoped click subscription guard.
 */
export function __resetTaskNotificationServiceForTesting(): void {
  unsubscribeNotificationClicked = null
}

let taskNotificationMessagingCleanup: (() => void)[] | null = null

/**
 * Background listeners for typed task-notification messaging.
 */
export function setupTaskNotificationMessagingListeners(): void {
  if (taskNotificationMessagingCleanup) {
    return
  }

  taskNotificationMessagingCleanup = [
    onTaskNotificationMessage(TaskNotificationMessageTypes.Test, ({ data }) =>
      resolveTaskNotificationTestMessage(data),
    ),
  ]
}

/**
 * Handles typed runtime requests that trigger a test task notification.
 */
export async function resolveTaskNotificationTestMessage(
  request: TaskNotificationTestRequest,
): Promise<TaskNotificationTestResponse> {
  try {
    const success = await notifyTaskResult(
      {
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Success,
        title: t("settings:taskNotifications.test.title"),
        message: t("settings:taskNotifications.test.message"),
      },
      request.channel
        ? {
            channels: [request.channel],
            ignoreTaskPreference: true,
            surfaceErrors: true,
          }
        : { ignoreTaskPreference: true },
    )

    return success
      ? { success: true, data: undefined }
      : createRuntimeMessageFailure(t("settings:taskNotifications.test.failed"))
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
