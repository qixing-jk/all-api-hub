import { getNotificationHttpErrorMessage } from "~/services/notifications/delivery/httpErrors"
import type {
  TaskNotificationContent,
  TaskNotificationPayload,
} from "~/services/notifications/taskNotificationContracts"
import {
  type TASK_NOTIFICATION_CHANNELS,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("TaskNotificationService")

const WEBHOOK_URL_TEMPLATE_PATTERN =
  /(?:\{|%7b)(title|message|task|status|total|success|failed|skipped)(?:\}|%7d)/gi

/** Formats an optional execution count for a webhook URL template. */
function formatWebhookTemplateCount(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toString()
    : ""
}

/**
 * Replaces supported webhook URL placeholders with encoded notification values.
 */
function renderWebhookUrlTemplate(
  template: string,
  payload: TaskNotificationPayload,
  content: TaskNotificationContent,
): string {
  const values = {
    title: content.title,
    message: content.message,
    task: payload.task,
    status: payload.status,
    total: formatWebhookTemplateCount(payload.counts?.total),
    success: formatWebhookTemplateCount(payload.counts?.success),
    failed: formatWebhookTemplateCount(payload.counts?.failed),
    skipped: formatWebhookTemplateCount(payload.counts?.skipped),
  }

  return template.replace(WEBHOOK_URL_TEMPLATE_PATTERN, (_, key: string) => {
    const normalizedKey = key.toLowerCase() as keyof typeof values
    return encodeURIComponent(values[normalizedKey])
  })
}

/**
 * Sends a JSON payload to a user-provided webhook endpoint.
 */
export async function sendWebhookNotification(
  payload: TaskNotificationPayload,
  content: TaskNotificationContent,
  config: TaskNotificationPreferences["channels"][typeof TASK_NOTIFICATION_CHANNELS.Webhook],
): Promise<boolean> {
  const url = config.url.trim()
  if (!url) {
    throw new Error(t("settings:taskNotifications.test.webhookMissingConfig"))
  }

  const parsedUrl = new URL(renderWebhookUrlTemplate(url, payload, content))
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
