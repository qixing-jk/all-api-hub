import { getNotificationParsedErrorMessage } from "~/services/notifications/delivery/httpErrors"
import type { TaskNotificationContent } from "~/services/notifications/taskNotificationContracts"
import {
  type TASK_NOTIFICATION_CHANNELS,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import { t } from "~/utils/i18n/core"

interface WecomWebhookResponseBody {
  errcode?: unknown
  errmsg?: unknown
}

const WECOM_BOT_WEBHOOK_PREFIX =
  "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key="
/** Delivers WeCom bot text messages and validates business success. */
export async function sendWecomNotification(
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
