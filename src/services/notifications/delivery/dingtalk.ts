import { getNotificationParsedErrorMessage } from "~/services/notifications/delivery/httpErrors"
import type { TaskNotificationContent } from "~/services/notifications/taskNotificationContracts"
import {
  type TASK_NOTIFICATION_CHANNELS,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import { t } from "~/utils/i18n/core"

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

const DINGTALK_CUSTOM_BOT_WEBHOOK_PREFIX =
  "https://oapi.dingtalk.com/robot/send?access_token="
/** Extracts the numeric error code from a DingTalk response body. */
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

/** Delivers DingTalk text messages with optional timestamp signing. */
export async function sendDingtalkNotification(
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
