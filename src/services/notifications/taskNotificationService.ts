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

interface FeishuWebhookResponseBody {
  code?: unknown
  msg?: unknown
  StatusCode?: unknown
  StatusMessage?: unknown
}

interface DingtalkWebhookResponseBody {
  errcode?: unknown
  errmsg?: unknown
}

interface DingtalkTextMessageBody {
  msgtype: "text"
  text: {
    content: string
  }
  at: {
    isAtAll: false
  }
}

interface WecomWebhookResponseBody {
  errcode?: unknown
  errmsg?: unknown
}

const FEISHU_CUSTOM_BOT_WEBHOOK_PREFIX =
  "https://open.feishu.cn/open-apis/bot/v2/hook/"
const DINGTALK_CUSTOM_BOT_WEBHOOK_PREFIX =
  "https://oapi.dingtalk.com/robot/send?access_token="
const WECOM_BOT_WEBHOOK_PREFIX =
  "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key="
const NTFY_DEFAULT_SERVER_URL = "https://ntfy.sh"
const ASCII_HEADER_VALUE_PATTERN = /^[\x20-\x7e]*$/

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
        msg?: unknown
        StatusMessage?: unknown
        error?: unknown
      }
      const message =
        body.description ??
        body.message ??
        body.msg ??
        body.StatusMessage ??
        body.error
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
 * Builds a user-facing failure message from a parsed third-party response body.
 */
function getNotificationParsedErrorMessage(
  labelKey: string,
  status: number,
  detail: string | null,
): string {
  const label = t(labelKey)
  return detail
    ? t("settings:taskNotifications.test.httpErrorWithDetail", {
        label,
        status,
        detail,
      })
    : t("settings:taskNotifications.test.httpError", {
        label,
        status,
      })
}

/**
 * Builds a user-facing HTTP failure message from a third-party response.
 */
async function getNotificationHttpErrorMessage(
  labelKey: string,
  response: Response,
): Promise<string> {
  const detail = await getNotificationResponseErrorDetail(response)
  return getNotificationParsedErrorMessage(labelKey, response.status, detail)
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
 * Sends a plain-text Feishu custom bot message.
 */
async function sendFeishuNotification(
  content: TaskNotificationContent,
  config: TaskNotificationPreferences["channels"][typeof TASK_NOTIFICATION_CHANNELS.Feishu],
): Promise<boolean> {
  const webhookInput = config.webhookKey.trim()
  if (!webhookInput) {
    throw new Error(t("settings:taskNotifications.test.feishuMissingConfig"))
  }

  const labelKey = "settings:taskNotifications.channels.feishu.title"
  const webhookUrl = webhookInput.startsWith("http://")
    ? webhookInput
    : webhookInput.startsWith("https://")
      ? webhookInput
      : `${FEISHU_CUSTOM_BOT_WEBHOOK_PREFIX}${encodeURIComponent(webhookInput)}`

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msg_type: "text",
      content: {
        text: `${content.title}\n${content.message}`,
      },
    }),
  })

  let body: FeishuWebhookResponseBody | null = null

  try {
    body = (await response.json()) as FeishuWebhookResponseBody
  } catch {
    body = null
  }

  const detail =
    typeof body?.msg === "string" && body.msg.trim()
      ? body.msg.trim()
      : typeof body?.StatusMessage === "string" && body.StatusMessage.trim()
        ? body.StatusMessage.trim()
        : null

  if (!response.ok) {
    throw new Error(
      getNotificationParsedErrorMessage(labelKey, response.status, detail),
    )
  }

  // Feishu's custom bot docs define `code` as the current success indicator.
  // `StatusCode` is retained only as a legacy fallback for older responses.
  const code = typeof body?.code === "number" ? body.code : null
  const statusCode =
    typeof body?.StatusCode === "number" ? body.StatusCode : null
  const isBusinessSuccess = code !== null ? code === 0 : statusCode === 0
  if (!isBusinessSuccess) {
    throw new Error(
      getNotificationParsedErrorMessage(labelKey, response.status, detail),
    )
  }

  return true
}

/**
 * Normalizes DingTalk webhook response codes returned as numbers or strings.
 */
function getDingtalkErrcode(body: DingtalkWebhookResponseBody | null) {
  if (typeof body?.errcode === "number") {
    return body.errcode
  }

  if (typeof body?.errcode === "string") {
    const parsed = Number(body.errcode)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

/**
 * Sends a plain-text DingTalk custom bot message.
 */
async function sendDingtalkNotification(
  content: TaskNotificationContent,
  config: TaskNotificationPreferences["channels"][typeof TASK_NOTIFICATION_CHANNELS.Dingtalk],
): Promise<boolean> {
  const webhookInput = config.webhookKey.trim()
  if (!webhookInput) {
    throw new Error(t("settings:taskNotifications.test.dingtalkMissingConfig"))
  }

  const labelKey = "settings:taskNotifications.channels.dingtalk.title"
  const webhookUrl =
    webhookInput.startsWith("http://") || webhookInput.startsWith("https://")
      ? new URL(webhookInput)
      : new URL(
          `${DINGTALK_CUSTOM_BOT_WEBHOOK_PREFIX}${encodeURIComponent(webhookInput)}`,
        )

  const secret = config.secret.trim()
  if (secret) {
    const timestamp = Date.now().toString()
    const signatureBase = `${timestamp}\n${secret}`
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signatureBase),
    )
    const sign = btoa(String.fromCharCode(...new Uint8Array(signature)))
    webhookUrl.searchParams.set("timestamp", timestamp)
    webhookUrl.searchParams.set("sign", sign)
  }

  const requestBody: DingtalkTextMessageBody = {
    msgtype: "text",
    text: {
      content: `${content.title}\n${content.message}`,
    },
    at: {
      isAtAll: false,
    },
  }

  const response = await fetch(webhookUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify(requestBody),
  })

  let responseBody: DingtalkWebhookResponseBody | null = null

  try {
    responseBody = (await response.json()) as DingtalkWebhookResponseBody
  } catch {
    responseBody = null
  }

  const detail =
    typeof responseBody?.errmsg === "string" && responseBody.errmsg.trim()
      ? responseBody.errmsg.trim()
      : null

  if (!response.ok) {
    throw new Error(
      getNotificationParsedErrorMessage(labelKey, response.status, detail),
    )
  }

  if (getDingtalkErrcode(responseBody) !== 0) {
    throw new Error(
      getNotificationParsedErrorMessage(labelKey, response.status, detail),
    )
  }

  return true
}

/**
 * Sends a plain-text WeCom group bot message.
 */
async function sendWecomNotification(
  content: TaskNotificationContent,
  config: TaskNotificationPreferences["channels"][typeof TASK_NOTIFICATION_CHANNELS.Wecom],
): Promise<boolean> {
  const webhookInput = config.webhookKey.trim()
  if (!webhookInput) {
    throw new Error(t("settings:taskNotifications.test.wecomMissingConfig"))
  }

  const labelKey = "settings:taskNotifications.channels.wecom.title"
  const webhookUrl =
    webhookInput.startsWith("http://") || webhookInput.startsWith("https://")
      ? webhookInput
      : `${WECOM_BOT_WEBHOOK_PREFIX}${encodeURIComponent(webhookInput)}`

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msgtype: "text",
      text: {
        content: `${content.title}\n${content.message}`,
      },
    }),
  })

  let body: WecomWebhookResponseBody | null = null

  try {
    body = (await response.json()) as WecomWebhookResponseBody
  } catch {
    body = null
  }

  const detail =
    typeof body?.errmsg === "string" && body.errmsg.trim()
      ? body.errmsg.trim()
      : null

  if (!response.ok) {
    throw new Error(
      getNotificationParsedErrorMessage(labelKey, response.status, detail),
    )
  }

  if (body?.errcode !== 0) {
    throw new Error(
      getNotificationParsedErrorMessage(labelKey, response.status, detail),
    )
  }

  return true
}

/**
 * Encodes non-ASCII header values for APIs such as ntfy that accept RFC 2047
 * encoded UTF-8 headers while browser fetch only allows ByteString headers.
 */
function encodeNotificationHeaderValue(value: string): string {
  if (ASCII_HEADER_VALUE_PATTERN.test(value)) {
    return value
  }

  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return `=?UTF-8?B?${btoa(binary)}?=`
}

/**
 * Sends a plain-text ntfy notification to a topic URL.
 */
async function sendNtfyNotification(
  content: TaskNotificationContent,
  config: TaskNotificationPreferences["channels"][typeof TASK_NOTIFICATION_CHANNELS.Ntfy],
): Promise<boolean> {
  const topicInput = config.topicUrl.trim()
  if (!topicInput) {
    throw new Error(t("settings:taskNotifications.test.ntfyMissingConfig"))
  }

  const labelKey = "settings:taskNotifications.channels.ntfy.title"
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(topicInput)) {
    if (
      !topicInput.startsWith("http://") &&
      !topicInput.startsWith("https://")
    ) {
      throw new Error(t("settings:taskNotifications.test.ntfyInvalidUrl"))
    }
  }
  const normalizedTopicInput = topicInput.replace(/^\/+/, "")
  const parsedUrl =
    topicInput.startsWith("http://") || topicInput.startsWith("https://")
      ? new URL(topicInput)
      : normalizedTopicInput.includes("/")
        ? new URL(`https://${normalizedTopicInput}`)
        : new URL(
            encodeURIComponent(normalizedTopicInput),
            `${NTFY_DEFAULT_SERVER_URL}/`,
          )

  if (!parsedUrl.pathname.replace(/^\/+/, "").trim()) {
    throw new Error(t("settings:taskNotifications.test.ntfyInvalidUrl"))
  }

  const headers: Record<string, string> = {
    Title: encodeNotificationHeaderValue(content.title),
    Priority: "default",
    Tags: "bell",
  }
  const accessToken = config.accessToken.trim()
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(parsedUrl.toString(), {
    method: "POST",
    headers,
    body: content.message,
  })

  if (!response.ok) {
    throw new Error(await getNotificationHttpErrorMessage(labelKey, response))
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
    shouldSendChannel(TASK_NOTIFICATION_CHANNELS.Feishu) &&
    channels[TASK_NOTIFICATION_CHANNELS.Feishu].enabled
  ) {
    try {
      deliveryResults.push(
        await sendFeishuNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Feishu],
        ),
      )
    } catch (error) {
      handleChannelFailure(TASK_NOTIFICATION_CHANNELS.Feishu, error)
    }
  }

  if (
    shouldSendChannel(TASK_NOTIFICATION_CHANNELS.Dingtalk) &&
    channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled
  ) {
    try {
      deliveryResults.push(
        await sendDingtalkNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Dingtalk],
        ),
      )
    } catch (error) {
      handleChannelFailure(TASK_NOTIFICATION_CHANNELS.Dingtalk, error)
    }
  }

  if (
    shouldSendChannel(TASK_NOTIFICATION_CHANNELS.Wecom) &&
    channels[TASK_NOTIFICATION_CHANNELS.Wecom].enabled
  ) {
    try {
      deliveryResults.push(
        await sendWecomNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Wecom],
        ),
      )
    } catch (error) {
      handleChannelFailure(TASK_NOTIFICATION_CHANNELS.Wecom, error)
    }
  }

  if (
    shouldSendChannel(TASK_NOTIFICATION_CHANNELS.Ntfy) &&
    channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled
  ) {
    try {
      deliveryResults.push(
        await sendNtfyNotification(
          content,
          channels[TASK_NOTIFICATION_CHANNELS.Ntfy],
        ),
      )
    } catch (error) {
      handleChannelFailure(TASK_NOTIFICATION_CHANNELS.Ntfy, error)
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
