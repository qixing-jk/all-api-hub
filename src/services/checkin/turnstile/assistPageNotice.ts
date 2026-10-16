import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { NotificationOptions } from "~/lib/notify"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { t } from "~/utils/i18n/core"

export type TurnstileAssistPageNotice = {
  action: typeof RuntimeActionIds.TurnstileAssistPageNotice
  requestId: string
  dismiss?: boolean
}

/** Shares the actionable reminder between extension toasts and the isolated content UI. */
export function showTurnstileAssistPageNotice(
  request: TurnstileAssistPageNotice,
  notify: {
    info: (message: string, options: NotificationOptions) => unknown
    dismiss: (id: string) => void
  },
): boolean {
  if (typeof request.requestId !== "string" || !request.requestId.trim())
    return false
  const id = `turnstile-assist:${request.requestId}`
  if (request.dismiss) {
    notify.dismiss(id)
    return true
  }
  if (document.visibilityState !== "visible" || !document.hasFocus())
    return false
  notify.info(t("shieldBypass:notification.turnstilePageBody"), {
    id,
    title: t("shieldBypass:notification.turnstileAssistTitle"),
    duration: 60_000,
    secondaryAction: {
      label: t("shieldBypass:notification.reminderSettings"),
      onClick: async () => {
        const response = await sendRuntimeMessage({
          action: RuntimeActionIds.OpenSettingsTurnstileAssist,
        })
        if (response?.success !== true)
          throw new Error("Reminder settings could not be opened")
      },
    },
    action: {
      label: t("shieldBypass:notification.openVerification"),
      onClick: async () => {
        const response = await sendRuntimeMessage({
          action: RuntimeActionIds.TurnstileAssistOpen,
          requestId: request.requestId,
        })
        if (response?.presented !== true) {
          notify.dismiss(id)
          notify.info(t("shieldBypass:notification.verificationEnded"), {
            duration: 5000,
          })
        }
      },
    },
  })
  return true
}
