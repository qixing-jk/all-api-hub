import { getNotificationHttpErrorMessage } from "~/services/notifications/delivery/httpErrors"
import type { TaskNotificationContent } from "~/services/notifications/taskNotificationContracts"
import {
  type TASK_NOTIFICATION_CHANNELS,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import { t } from "~/utils/i18n/core"

const NTFY_DEFAULT_SERVER_URL = "https://ntfy.sh"
const ASCII_HEADER_VALUE_PATTERN = /^[\x20-\x7e]*$/
/** Encodes ntfy header values while preserving non-ASCII notification text. */
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
export async function sendNtfyNotification(
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
