import { getNotificationHttpErrorMessage } from "~/services/notifications/delivery/httpErrors"
import type { TaskNotificationContent } from "~/services/notifications/taskNotificationContracts"
import {
  type TASK_NOTIFICATION_CHANNELS,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import { t } from "~/utils/i18n/core"

const TELEGRAM_MESSAGE_MAX_LENGTH = 4096
const TELEGRAM_NOTIFICATION_LABEL_KEY =
  "settings:taskNotifications.channels.telegram.title"

/** Delivers a plain-text Telegram Bot message. */
export async function sendTelegramNotification(
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
        text: `${content.title}\n${content.message}`.slice(
          0,
          TELEGRAM_MESSAGE_MAX_LENGTH,
        ),
        disable_web_page_preview: true,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getNotificationHttpErrorMessage(
        TELEGRAM_NOTIFICATION_LABEL_KEY,
        response,
      ),
    )
  }

  return true
}
