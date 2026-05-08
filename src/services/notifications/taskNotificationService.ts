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
  normalizeTaskNotificationPreferences,
  parseTaskNotificationId,
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationChannel,
  type TaskNotificationPreferences,
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
  title?: string
  message?: string
}

interface TaskNotificationMessageRequest {
  action: string
  channel?: TaskNotificationChannel
}

interface TaskNotificationMessageResponse {
  success: boolean
  error?: string
}

interface TaskNotificationContent {
  title: string
  message: string
}

interface TaskNotificationDeliveryOptions {
  channels?: readonly TaskNotificationChannel[]
  ignoreTaskPreference?: boolean
  surfaceErrors?: boolean
}

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
    searchParams: { tab: "dataBackup", anchor: "webdav-auto-sync" },
  },
  [TASK_NOTIFICATION_TASKS.ManagedSiteModelSync]: {
    menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
  },
  [TASK_NOTIFICATION_TASKS.UsageHistorySync]: {
    menuItemId: MENU_ITEM_IDS.BASIC,
    searchParams: { tab: "accountUsage" },
  },
  [TASK_NOTIFICATION_TASKS.BalanceHistoryCapture]: {
    menuItemId: MENU_ITEM_IDS.BASIC,
    searchParams: { tab: "balanceHistory" },
  },
  [TASK_NOTIFICATION_TASKS.SiteAnnouncements]: {
    menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
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
function buildNotificationContent(payload: TaskNotificationPayload) {
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

/**
 * Extracts a concise error detail from third-party notification responses.
 */
async function getNotificationResponseErrorDetail(
  response: Response,
): Promise<string | null> {
  try {
    const contentType = response.headers.get("content-type") ?? ""
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as {
        description?: unknown
        message?: unknown
        error?: unknown
      }
      const message = body.description ?? body.message ?? body.error
      return typeof message === "string" && message.trim()
        ? message.trim()
        : null
    }

    const text = await response.text()
    return text.trim() ? text.trim().slice(0, 300) : null
  } catch {
    return null
  }
}

/**
 * Builds a user-facing HTTP failure message from a third-party response.
 */
async function getNotificationHttpErrorMessage(
  labelKey: string,
  response: Response,
): Promise<string> {
  const detail = await getNotificationResponseErrorDetail(response)
  const label = t(labelKey)
  return detail
    ? t("settings:taskNotifications.test.httpErrorWithDetail", {
        label,
        status: response.status,
        detail,
      })
    : t("settings:taskNotifications.test.httpError", {
        label,
        status: response.status,
      })
}

/**
 * Sends a browser system notification when that channel is enabled and allowed.
 */
async function sendBrowserNotification(
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

/**
 * Sends a plain-text Telegram Bot message.
 */
async function sendTelegramNotification(
  content: TaskNotificationContent,
  config: TaskNotificationPreferences["channels"][typeof TASK_NOTIFICATION_CHANNELS.Telegram],
): Promise<boolean> {
  const botToken = config.botToken.trim()
  const chatId = config.chatId.trim()
  if (!botToken || !chatId) {
    throw new Error(t("settings:taskNotifications.test.telegramMissingConfig"))
  }

  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${content.title}\n${content.message}`.slice(0, 4096),
        disable_web_page_preview: true,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getNotificationHttpErrorMessage(
        "settings:taskNotifications.channels.telegram.title",
        response,
      ),
    )
  }

  return true
}

/**
 * Sends a JSON payload to a user-provided webhook endpoint.
 */
async function sendWebhookNotification(
  payload: TaskNotificationPayload,
  content: TaskNotificationContent,
  config: TaskNotificationPreferences["channels"][typeof TASK_NOTIFICATION_CHANNELS.Webhook],
): Promise<boolean> {
  const url = config.url.trim()
  if (!url) {
    throw new Error(t("settings:taskNotifications.test.webhookMissingConfig"))
  }

  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    logger.warn("Webhook task notification skipped: unsupported URL protocol", {
      task: payload.task,
      status: payload.status,
      protocol: parsedUrl.protocol,
    })
    throw new Error(t("settings:taskNotifications.test.webhookInvalidUrl"))
  }

  const response = await fetch(parsedUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "all-api-hub",
      title: content.title,
      message: content.message,
      task: payload.task,
      status: payload.status,
      counts: payload.counts ?? null,
    }),
  })

  if (!response.ok) {
    throw new Error(
      await getNotificationHttpErrorMessage(
        "settings:taskNotifications.channels.webhook.title",
        response,
      ),
    )
  }

  return true
}

/**
 * Sends the prepared notification content through all enabled channels.
 */
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

  if (
    shouldSendChannel(TASK_NOTIFICATION_CHANNELS.Telegram) &&
    channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled
  ) {
    try {
      deliveryResults.push(
        await sendTelegramNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Telegram],
        ),
      )
    } catch (error) {
      handleChannelFailure(TASK_NOTIFICATION_CHANNELS.Telegram, error)
    }
  }

  if (
    shouldSendChannel(TASK_NOTIFICATION_CHANNELS.Webhook) &&
    channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled
  ) {
    try {
      deliveryResults.push(
        await sendWebhookNotification(
          payload,
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Webhook],
        ),
      )
    } catch (error) {
      handleChannelFailure(TASK_NOTIFICATION_CHANNELS.Webhook, error)
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

/**
 * Handles runtime requests that trigger a test task notification.
 */
export async function handleTaskNotificationMessage(
  request: TaskNotificationMessageRequest,
  sendResponse: (response: TaskNotificationMessageResponse) => void,
): Promise<void> {
  if (request.action !== RuntimeActionIds.TaskNotificationsTest) {
    sendResponse({ success: false, error: "Unknown action" })
    return
  }

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

    sendResponse({
      success,
      error: success ? undefined : t("settings:taskNotifications.test.failed"),
    })
  } catch (error) {
    sendResponse({
      success: false,
      error: getErrorMessage(error),
    })
  }
}
