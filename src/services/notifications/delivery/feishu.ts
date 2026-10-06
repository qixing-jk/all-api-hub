import { getNotificationParsedErrorMessage } from "~/services/notifications/delivery/httpErrors"
import type { TaskNotificationContent } from "~/services/notifications/taskNotificationContracts"
import {
  type TASK_NOTIFICATION_CHANNELS,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import { t } from "~/utils/i18n/core"

interface FeishuWebhookResponseBody {
  code?: unknown
  msg?: unknown
  StatusCode?: unknown
  StatusMessage?: unknown
}

const FEISHU_CUSTOM_BOT_WEBHOOK_PREFIX =
  "https://open.feishu.cn/open-apis/bot/v2/hook/"
/** Delivers Feishu custom-bot text messages and validates business success. */
export async function sendFeishuNotification(
  content: TaskNotificationContent,
  config: TaskNotificationPreferences["channels"][typeof TASK_NOTIFICATION_CHANNELS.Feishu],
): Promise<boolean> {
  const webhookInput = config.webhookKey.trim()
  if (!webhookInput) {
    throw new Error(t("settings:taskNotifications.test.feishuMissingConfig"))
  }

  const labelKey = "settings:taskNotifications.channels.feishu.title"
  const webhookUrl =
    webhookInput.startsWith("http://") || webhookInput.startsWith("https://")
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
